export * from "./types.js";
export { WorkspaceIndex } from "./index/workspaceIndex.js";
export { similarityScore, jaccard, couldMatch } from "./similarity/compare.js";
export { normalizeToTokens, toShingles, computeSignature } from "./ast/normalize.js";
export { extractFunctions, nameOf } from "./ast/extract.js";
