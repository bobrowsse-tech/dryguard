/** A single unit of code DryGuard can compare: a function, method, or arrow function. */
export interface CodeUnit {
  /** Stable id: `${filePath}#${name}@${startLine}` */
  id: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  /** Raw source text of the unit, as written. */
  sourceText: string;
  /** Normalized token stream used for structural comparison (identifiers/literals folded). */
  normalizedTokens: string[];
  /** Shingle set derived from normalizedTokens, used for Jaccard similarity. */
  shingles: Set<string>;
  /** Cheap params/complexity signal, used to pre-filter candidates before full comparison. */
  signature: UnitSignature;
}

export interface UnitSignature {
  paramCount: number;
  tokenCount: number;
  /** Count of control-flow keywords (if/for/while/switch/try/catch), a coarse shape signal. */
  branchCount: number;
}

export interface SimilarityMatch {
  unit: CodeUnit;
  /** 0..1 structural similarity score. */
  score: number;
  /**
   * Location of the *candidate* (the newly proposed code) that triggered
   * this match, when the request contained more than one function — lets
   * callers (e.g. the LSP server) place a diagnostic on the right span
   * instead of the whole document.
   */
  candidateRange?: { name: string; startLine: number; endLine: number };
}

export interface CheckSimilarityRequest {
  /** Source of the newly proposed/written code (a function body, or a whole file). */
  code: string;
  /** Optional file path, used only for reporting/exclusion, not required. */
  filePath?: string;
  /** Minimum score (0..1) to be considered a duplicate. Default 0.85. */
  threshold?: number;
  /** Max number of matches to return. Default 5. */
  limit?: number;
}

export interface CheckSimilarityResult {
  isDuplicate: boolean;
  threshold: number;
  matches: SimilarityMatch[];
}

export interface IndexWorkspaceOptions {
  /** Absolute path to the workspace/project root. */
  rootDir: string;
  /** Glob patterns to include. Defaults to common TS/JS source files. */
  include?: string[];
  /** Glob patterns to exclude. Defaults to node_modules, dist, build, tests. */
  exclude?: string[];
}

export interface IndexStats {
  filesScanned: number;
  unitsIndexed: number;
  durationMs: number;
}
