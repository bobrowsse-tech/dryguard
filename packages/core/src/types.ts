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
  /**
   * Bag of real (un-folded) call targets, property accesses, and free
   * identifiers referenced in the body — the "what APIs/names does this
   * touch" signal, used by the opt-in semantic tier to catch functions that
   * do the same thing via a different structural shape (e.g. a `for` loop
   * vs `.reduce()`).
   */
  identifierBag: Map<string, number>;
  /** Cheap params/complexity signal, used to pre-filter candidates before full comparison. */
  signature: UnitSignature;
  /** Content hash of the source file this unit came from, for cache invalidation. */
  fileHash?: string;
}

export interface UnitSignature {
  paramCount: number;
  tokenCount: number;
  /** Count of control-flow keywords (if/for/while/switch/try/catch), a coarse shape signal. */
  branchCount: number;
}

export type MatchType = "structural" | "semantic";

export interface SimilarityMatch {
  unit: CodeUnit;
  /** 0..1 similarity score. */
  score: number;
  /** Which tier produced this match. */
  matchType: MatchType;
  /**
   * Location of the *candidate* (the newly proposed code) that triggered
   * this match, when the request contained more than one function — lets
   * callers (e.g. the LSP server) place a diagnostic on the right span
   * instead of the whole document.
   */
  candidateRange?: { name: string; startLine: number; endLine: number; filePath?: string };
}

export interface CheckSimilarityRequest {
  /** Source of the newly proposed/written code (a function body, or a whole file). */
  code: string;
  /** Optional file path, used only for reporting/exclusion, not required. */
  filePath?: string;
  /** Minimum score (0..1) to be considered a structural duplicate. Default from config, else 0.85. */
  threshold?: number;
  /**
   * Enables the second, looser semantic tier (identifier/call-name bag
   * cosine similarity) in addition to structural matching. Off by default
   * because it's a coarser heuristic with more false positives. Default
   * from config, else false.
   */
  semantic?: boolean;
  /** Minimum score (0..1) for a semantic match. Default from config, else 0.7. */
  semanticThreshold?: number;
  /** Max number of matches to return. Default 5. */
  limit?: number;
  /** Skip matches present in the baseline (known/accepted existing duplication). Default true. */
  useBaseline?: boolean;
}

export interface CheckSimilarityResult {
  isDuplicate: boolean;
  threshold: number;
  matches: SimilarityMatch[];
}

export interface IndexWorkspaceOptions {
  /** Absolute path to the workspace/project root. */
  rootDir: string;
  /** Glob patterns to include. Defaults to common TS/JS/Python/Go source files. */
  include?: string[];
  /** Glob patterns to exclude. Defaults to node_modules, dist, build, tests, vendor, .git. */
  exclude?: string[];
  /**
   * Path to a persistent cache file (relative to rootDir or absolute).
   * When set and present, unchanged files (by content hash) are loaded
   * from cache instead of re-parsed. Defaults to `.dryguard/cache.json`
   * when a config file enables caching; off otherwise unless passed here.
   */
  cachePath?: string;
  /** Path to a baseline file of accepted existing duplicates. See `DryGuardConfig.baselinePath`. */
  baselinePath?: string;
  /** Explicit config, bypassing the .dryguardrc.json lookup (mainly for tests/CLI). */
  config?: DryGuardConfig;
}

export interface IndexStats {
  filesScanned: number;
  unitsIndexed: number;
  filesFromCache: number;
  durationMs: number;
}

/** Resolved DryGuard configuration, merged from defaults + `.dryguardrc.json`. */
export interface DryGuardConfig {
  threshold: number;
  semanticTier: { enabled: boolean; threshold: number };
  include: string[];
  exclude: string[];
  /** Comment marker that suppresses a function from indexing/matching entirely. */
  ignoreComment: string;
  /** Path (relative to the config's directory) to the cache file, or false to disable caching. */
  cachePath: string | false;
  /** Path (relative to the config's directory) to the baseline file, or false to disable it. */
  baselinePath: string | false;
}

/** One accepted/known duplicate pair, recorded by `dryguard baseline`. */
export interface BaselineEntry {
  /** Unit ids, order-independent (see `pairKey`). */
  a: string;
  b: string;
  matchType: MatchType;
  score: number;
}

export interface BaselineFile {
  version: 1;
  generatedAt: string;
  entries: BaselineEntry[];
}
