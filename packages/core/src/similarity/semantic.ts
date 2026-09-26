import type { CodeUnit } from "../types.js";

/**
 * Cosine similarity between two identifier-frequency bags — a coarse
 * "what names/APIs does this touch" signal. This is a heuristic, not a
 * learned embedding: it's cheap, needs no model download, and works
 * offline, at the cost of missing similarity that isn't visible in shared
 * names (e.g. two functions that both compute a running total but never
 * call the same helpers or reference the same fields).
 *
 * Swap-in point for a real local embedding model: implement
 * `SemanticScorer` against e.g. `@xenova/transformers` and pass it to
 * `WorkspaceIndex` instead of `bagCosineSimilarity`, keeping the same
 * (CodeUnit, CodeUnit) => number shape.
 */
export function bagCosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  for (const [term, countA] of a) {
    const countB = b.get(term);
    if (countB) dot += countA * countB;
  }
  if (dot === 0) return 0;

  const magnitude = (bag: Map<string, number>) =>
    Math.sqrt([...bag.values()].reduce((sum, c) => sum + c * c, 0));

  const denom = magnitude(a) * magnitude(b);
  return denom === 0 ? 0 : dot / denom;
}

export function semanticScore(a: CodeUnit, b: CodeUnit): number {
  return bagCosineSimilarity(a.identifierBag, b.identifierBag);
}

/** Interface for a pluggable semantic scorer, so a real embedding model can replace the heuristic later. */
export interface SemanticScorer {
  score(a: CodeUnit, b: CodeUnit): number;
}

export const heuristicSemanticScorer: SemanticScorer = { score: semanticScore };
