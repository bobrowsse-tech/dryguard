import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import { Project } from "ts-morph";
import { extractFunctions, nameOf } from "../ast/extract.js";
import { analyzeFunction, toShingles } from "../ast/normalize.js";
import { loadBaseline, pairKey } from "../config/baseline.js";
import { loadConfig } from "../config/config.js";
import { FileCache, hashContent } from "../cache/fileCache.js";
import { LanguageRegistry } from "../lang/registry.js";
import { unitToCodeUnit } from "../lang/types.js";
import { similarityScore } from "../similarity/compare.js";
import { semanticScore } from "../similarity/semantic.js";
import type {
  CheckSimilarityRequest,
  CheckSimilarityResult,
  CodeUnit,
  DryGuardConfig,
  IndexStats,
  IndexWorkspaceOptions,
  SimilarityMatch,
} from "../types.js";

const DEFAULT_LIMIT = 5;

/**
 * In-memory index of every function/method in a workspace, structurally
 * fingerprinted so new code can be compared against it in near-constant
 * time per candidate. One instance is meant to live for the lifetime of an
 * editor session (VS Code extension, LSP server, or MCP server process)
 * and be incrementally updated as files change.
 */
export class WorkspaceIndex {
  private unitsByFile = new Map<string, CodeUnit[]>();
  private project: Project;
  private cache: FileCache | undefined;
  private cachePath: string | undefined;
  private baseline: Set<string>;
  private languages: LanguageRegistry;

  constructor(
    private readonly rootDir: string,
    readonly config: DryGuardConfig,
  ) {
    this.project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true },
    });
    this.languages = new LanguageRegistry(packageGrammarsDir());
    this.baseline =
      config.baselinePath !== false
        ? loadBaseline(resolveConfigPath(rootDir, config.baselinePath))
        : new Set();
  }

  static async build(options: IndexWorkspaceOptions): Promise<{
    index: WorkspaceIndex;
    stats: IndexStats;
  }> {
    const start = Date.now();
    const config = options.config ?? loadConfig(options.rootDir);
    const index = new WorkspaceIndex(options.rootDir, config);
    await index.languages.warmUp();

    const cachePath =
      options.cachePath ??
      (config.cachePath !== false ? resolveConfigPath(options.rootDir, config.cachePath) : undefined);
    if (cachePath) {
      index.cache = FileCache.load(cachePath);
      index.cachePath = cachePath;
    }

    const files = await fg(options.include ?? config.include, {
      cwd: options.rootDir,
      absolute: true,
      ignore: options.exclude ?? config.exclude,
      dot: false,
    });

    let unitsIndexed = 0;
    let filesFromCache = 0;
    for (const file of files) {
      const result = await index.indexFileInternal(file);
      unitsIndexed += result.unitCount;
      if (result.fromCache) filesFromCache++;
    }

    index.cache?.save(cachePath!);

    return {
      index,
      stats: {
        filesScanned: files.length,
        unitsIndexed,
        filesFromCache,
        durationMs: Date.now() - start,
      },
    };
  }

  /** (Re-)indexes a single file, replacing any units previously recorded for it. Synchronous TS/JS fast path. */
  indexFile(filePath: string, sourceTextOverride?: string): number {
    const adapter = this.languages.forFile(filePath);
    if (adapter && this.languages.isTreeSitter(adapter)) {
      // Tree-sitter grammars load asynchronously; callers on a hot,
      // synchronous path (LSP didChange) should prefer indexFileAsync for
      // non-TS files. We still make a best-effort attempt here so nothing
      // throws — if the grammar isn't warmed up yet this simply indexes 0
      // units for this file until the async path catches up.
      try {
        const units = adapter
          .extract(sourceTextOverride ?? readFileSync(filePath, "utf8"), {
            ignoreComment: this.config.ignoreComment,
          })
          .map((u) => unitToCodeUnit(filePath, u, toShingles));
        this.unitsByFile.set(filePath, units);
        return units.length;
      } catch {
        return 0;
      }
    }

    this.project.getSourceFile(filePath)?.forget();
    const sourceFile = sourceTextOverride
      ? this.project.createSourceFile(filePath, sourceTextOverride, { overwrite: true })
      : this.project.addSourceFileAtPath(filePath);

    const functions = extractFunctions(sourceFile, { ignoreComment: this.config.ignoreComment });
    const units: CodeUnit[] = functions.map((fn) => {
      const analyzed = analyzeFunction(fn);
      const name = nameOf(fn);
      return {
        id: `${filePath}#${name}@${fn.getStartLineNumber()}`,
        name,
        filePath,
        startLine: fn.getStartLineNumber(),
        endLine: fn.getEndLineNumber(),
        sourceText: fn.getText(),
        normalizedTokens: analyzed.tokens,
        shingles: toShingles(analyzed.tokens),
        identifierBag: analyzed.identifierBag,
        signature: analyzed.signature,
      };
    });

    this.unitsByFile.set(filePath, units);
    return units.length;
  }

  /** Async variant that also covers tree-sitter languages properly; used by the initial workspace build. */
  private async indexFileInternal(filePath: string): Promise<{ unitCount: number; fromCache: boolean }> {
    const content = readFileSync(filePath, "utf8");
    const hash = hashContent(content);

    const cached = this.cache?.get(filePath, hash);
    if (cached) {
      this.unitsByFile.set(filePath, cached);
      return { unitCount: cached.length, fromCache: true };
    }

    const adapter = this.languages.forFile(filePath);
    let units: CodeUnit[];

    if (adapter && this.languages.isTreeSitter(adapter)) {
      const extracted = await adapter.extractAsync(content, { ignoreComment: this.config.ignoreComment });
      units = extracted.map((u) => unitToCodeUnit(filePath, u, toShingles, hash));
    } else {
      this.indexFile(filePath, content);
      units = (this.unitsByFile.get(filePath) ?? []).map((u) => ({ ...u, fileHash: hash }));
    }

    this.unitsByFile.set(filePath, units);
    this.cache?.set(filePath, hash, units);
    return { unitCount: units.length, fromCache: false };
  }

  removeFile(filePath: string): void {
    this.project.getSourceFile(filePath)?.forget();
    this.unitsByFile.delete(filePath);
    this.cache?.delete(filePath);
  }

  persistCache(): void {
    if (this.cache && this.cachePath) this.cache.save(this.cachePath);
  }

  get size(): number {
    let total = 0;
    for (const units of this.unitsByFile.values()) total += units.length;
    return total;
  }

  allUnits(): CodeUnit[] {
    return [...this.unitsByFile.values()].flat();
  }

  /**
   * Checks a snippet of proposed code (a function body, or a whole file)
   * against every indexed unit and returns the closest matches — the core
   * call an AI agent makes *before* writing new code, and what the CLI's
   * `scan` command runs pairwise across the whole workspace.
   */
  checkSimilarity(request: CheckSimilarityRequest): CheckSimilarityResult {
    const threshold = request.threshold ?? this.config.threshold;
    const limit = request.limit ?? DEFAULT_LIMIT;
    const semanticEnabled = request.semantic ?? this.config.semanticTier.enabled;
    const semanticThreshold = request.semanticThreshold ?? this.config.semanticTier.threshold;
    const useBaseline = request.useBaseline ?? true;

    const adapter = request.filePath ? this.languages.forFile(request.filePath) : undefined;
    const candidateUnits: CodeUnit[] =
      adapter && this.languages.isTreeSitter(adapter)
        ? [] // async-only path; CLI/tree-sitter candidates should call checkSimilarityAsync
        : extractCandidatesViaTsMorph(this.project, request.code, this.config.ignoreComment, request.filePath);

    const allMatches: SimilarityMatch[] = [];
    for (const candidate of candidateUnits) {
      for (const existing of this.allUnits()) {
        if (existing.filePath === request.filePath) continue; // skip self-file
        if (useBaseline && this.baseline.has(pairKey(candidate.id, existing.id))) continue;

        const structural = similarityScore(candidate, existing);
        if (structural >= threshold) {
          allMatches.push({
            unit: existing,
            score: structural,
            matchType: "structural",
            candidateRange:
              candidateUnits.length > 1
                ? { name: candidate.name, startLine: candidate.startLine, endLine: candidate.endLine }
                : undefined,
          });
          continue;
        }

        if (semanticEnabled) {
          const semantic = semanticScore(candidate, existing);
          if (semantic >= semanticThreshold) {
            allMatches.push({
              unit: existing,
              score: semantic,
              matchType: "semantic",
              candidateRange:
                candidateUnits.length > 1
                  ? { name: candidate.name, startLine: candidate.startLine, endLine: candidate.endLine }
                  : undefined,
            });
          }
        }
      }
    }

    allMatches.sort((a, b) => b.score - a.score);
    const matches = allMatches.slice(0, limit);

    return { isDuplicate: matches.length > 0, threshold, matches };
  }

  /** Every pairwise structural/semantic match across the whole indexed workspace — what `dryguard scan` uses. */
  scanWorkspace(options: { semantic?: boolean; semanticThreshold?: number; threshold?: number } = {}): SimilarityMatch[] {
    const threshold = options.threshold ?? this.config.threshold;
    const semanticEnabled = options.semantic ?? this.config.semanticTier.enabled;
    const semanticThreshold = options.semanticThreshold ?? this.config.semanticTier.threshold;

    const units = this.allUnits();
    const results: SimilarityMatch[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i]!;
        const b = units[j]!;
        if (a.filePath === b.filePath) continue;
        const key = pairKey(a.id, b.id);
        if (seen.has(key) || this.baseline.has(key)) continue;

        const structural = similarityScore(a, b);
        if (structural >= threshold) {
          results.push({
            unit: b,
            score: structural,
            matchType: "structural",
            candidateRange: { name: a.name, startLine: a.startLine, endLine: a.endLine, filePath: a.filePath },
          });
          seen.add(key);
          continue;
        }
        if (semanticEnabled) {
          const semantic = semanticScore(a, b);
          if (semantic >= semanticThreshold) {
            results.push({
              unit: b,
              score: semantic,
              matchType: "semantic",
              candidateRange: { name: a.name, startLine: a.startLine, endLine: a.endLine, filePath: a.filePath },
            });
            seen.add(key);
          }
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}

function extractCandidatesViaTsMorph(
  project: Project,
  code: string,
  ignoreComment: string,
  filePath?: string,
): CodeUnit[] {
  const scratch = project.createSourceFile(
    `${filePath ?? "__dryguard_scratch__.ts"}.__dryguard_check__.ts`,
    code,
    { overwrite: true },
  );
  try {
    return extractFunctions(scratch, { ignoreComment }).map((fn) => {
      const analyzed = analyzeFunction(fn);
      const name = nameOf(fn);
      return {
        id: `candidate#${name}@${fn.getStartLineNumber()}`,
        name,
        filePath: filePath ?? "<candidate>",
        startLine: fn.getStartLineNumber(),
        endLine: fn.getEndLineNumber(),
        sourceText: fn.getText(),
        normalizedTokens: analyzed.tokens,
        shingles: toShingles(analyzed.tokens),
        identifierBag: analyzed.identifierBag,
        signature: analyzed.signature,
      };
    });
  } finally {
    scratch.forget();
  }
}

function resolveConfigPath(rootDir: string, relativeOrAbsolute: string): string {
  return relativeOrAbsolute.startsWith("/") ? relativeOrAbsolute : join(rootDir, relativeOrAbsolute);
}

/** `<package root>/grammars`, resolved relative to this module regardless of where the package is installed. */
function packageGrammarsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/index/workspaceIndex.js -> package root is two levels up.
  return join(here, "..", "..", "grammars");
}
