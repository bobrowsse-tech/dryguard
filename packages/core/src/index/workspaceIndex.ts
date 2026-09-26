import fg from "fast-glob";
import { Project } from "ts-morph";
import { extractFunctions, nameOf } from "../ast/extract.js";
import { computeSignature, normalizeToTokens, toShingles } from "../ast/normalize.js";
import { similarityScore } from "../similarity/compare.js";
import type {
  CheckSimilarityRequest,
  CheckSimilarityResult,
  CodeUnit,
  IndexStats,
  IndexWorkspaceOptions,
  SimilarityMatch,
} from "../types.js";

const DEFAULT_INCLUDE = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/*.d.ts",
  "**/*.test.*",
  "**/*.spec.*",
];
const DEFAULT_THRESHOLD = 0.85;
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

  constructor(private readonly rootDir: string) {
    this.project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true },
    });
  }

  static async build(options: IndexWorkspaceOptions): Promise<{
    index: WorkspaceIndex;
    stats: IndexStats;
  }> {
    const start = Date.now();
    const index = new WorkspaceIndex(options.rootDir);

    const files = await fg(options.include ?? DEFAULT_INCLUDE, {
      cwd: options.rootDir,
      absolute: true,
      ignore: options.exclude ?? DEFAULT_EXCLUDE,
      dot: false,
    });

    let unitsIndexed = 0;
    for (const file of files) {
      unitsIndexed += index.indexFile(file);
    }

    return {
      index,
      stats: {
        filesScanned: files.length,
        unitsIndexed,
        durationMs: Date.now() - start,
      },
    };
  }

  /** (Re-)indexes a single file, replacing any units previously recorded for it. */
  indexFile(filePath: string, sourceTextOverride?: string): number {
    this.project.getSourceFile(filePath)?.forget();
    const sourceFile = sourceTextOverride
      ? this.project.createSourceFile(filePath, sourceTextOverride, { overwrite: true })
      : this.project.addSourceFileAtPath(filePath);

    const functions = extractFunctions(sourceFile);
    const units: CodeUnit[] = functions.map((fn) => {
      const tokens = normalizeToTokens(fn);
      const startLine = fn.getStartLineNumber();
      const name = nameOf(fn);
      return {
        id: `${filePath}#${name}@${startLine}`,
        name,
        filePath,
        startLine,
        endLine: fn.getEndLineNumber(),
        sourceText: fn.getText(),
        normalizedTokens: tokens,
        shingles: toShingles(tokens),
        signature: computeSignature(fn, tokens),
      };
    });

    this.unitsByFile.set(filePath, units);
    return units.length;
  }

  removeFile(filePath: string): void {
    this.project.getSourceFile(filePath)?.forget();
    this.unitsByFile.delete(filePath);
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
   * against every indexed unit and returns the closest structural matches.
   * This is the core call an AI agent makes *before* writing new code.
   */
  checkSimilarity(request: CheckSimilarityRequest): CheckSimilarityResult {
    const threshold = request.threshold ?? DEFAULT_THRESHOLD;
    const limit = request.limit ?? DEFAULT_LIMIT;

    const scratchPath = request.filePath ?? "__dryguard_scratch__.ts";
    const scratch = this.project.createSourceFile(
      `${scratchPath}.__dryguard_check__.ts`,
      request.code,
      { overwrite: true },
    );

    try {
      const candidates = extractFunctions(scratch);
      // If the snippet isn't a whole function (e.g. a bare expression), wrap
      // nothing extra — compare the snippet itself as one unit via its tokens.
      const candidateUnits: CodeUnit[] =
        candidates.length > 0
          ? candidates.map((fn) => {
              const tokens = normalizeToTokens(fn);
              return {
                id: "candidate",
                name: nameOf(fn),
                filePath: request.filePath ?? "<candidate>",
                startLine: fn.getStartLineNumber(),
                endLine: fn.getEndLineNumber(),
                sourceText: fn.getText(),
                normalizedTokens: tokens,
                shingles: toShingles(tokens),
                signature: computeSignature(fn, tokens),
              };
            })
          : [];

      const allMatches: SimilarityMatch[] = [];
      for (const candidate of candidateUnits) {
        for (const existing of this.allUnits()) {
          if (existing.filePath === request.filePath) continue; // skip self-file
          const score = similarityScore(candidate, existing);
          if (score >= threshold) {
            allMatches.push({
              unit: existing,
              score,
              candidateRange:
                candidateUnits.length > 1
                  ? {
                      name: candidate.name,
                      startLine: candidate.startLine,
                      endLine: candidate.endLine,
                    }
                  : undefined,
            });
          }
        }
      }

      allMatches.sort((a, b) => b.score - a.score);
      const matches = allMatches.slice(0, limit);

      return {
        isDuplicate: matches.length > 0,
        threshold,
        matches,
      };
    } finally {
      scratch.forget();
    }
  }
}
