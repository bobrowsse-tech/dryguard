import type { CodeUnit } from "../types.js";

/** What a language adapter needs to produce a `CodeUnit` for every function/method in a file. */
export interface ExtractedUnit {
  name: string;
  startLine: number;
  endLine: number;
  sourceText: string;
  normalizedTokens: string[];
  identifierBag: Map<string, number>;
  paramCount: number;
  branchCount: number;
}

/**
 * A language adapter turns source text into `ExtractedUnit`s. Keeping this
 * as a narrow interface (rather than exposing each language's own AST
 * types) is what lets `WorkspaceIndex` stay language-agnostic and lets a
 * new language be added as a new adapter instead of a fork of the engine.
 */
export interface LanguageAdapter {
  /** Human-readable id, e.g. "typescript", "python", "go". */
  readonly id: string;
  /** File extensions (without the dot) this adapter claims. */
  readonly extensions: string[];
  /** Extracts every sufficiently-large function/method from `sourceText`. */
  extract(sourceText: string, options: { ignoreComment: string }): ExtractedUnit[];
}

export function unitToCodeUnit(
  filePath: string,
  unit: ExtractedUnit,
  toShingles: (tokens: string[]) => Set<string>,
  fileHash?: string,
): CodeUnit {
  return {
    id: `${filePath}#${unit.name}@${unit.startLine}`,
    name: unit.name,
    filePath,
    startLine: unit.startLine,
    endLine: unit.endLine,
    sourceText: unit.sourceText,
    normalizedTokens: unit.normalizedTokens,
    shingles: toShingles(unit.normalizedTokens),
    identifierBag: unit.identifierBag,
    signature: {
      paramCount: unit.paramCount,
      tokenCount: unit.normalizedTokens.length,
      branchCount: unit.branchCount,
    },
    fileHash,
  };
}
