import type { CodeUnit, UnitSignature } from "../types.js";

/** Jaccard similarity between two shingle sets: |A ∩ B| / |A ∪ B|. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Cheap pre-filter: two units with wildly different shape (param count,
 * branch count, token count) can't be near-duplicates, so skip the
 * expensive shingle comparison entirely. This keeps `checkSimilarity`
 * fast even against a large workspace index.
 */
export function couldMatch(a: UnitSignature, b: UnitSignature): boolean {
  if (Math.abs(a.paramCount - b.paramCount) > 2) return false;
  const tokenRatio =
    Math.min(a.tokenCount, b.tokenCount) / Math.max(a.tokenCount, b.tokenCount, 1);
  if (tokenRatio < 0.5) return false;
  if (Math.abs(a.branchCount - b.branchCount) > 3) return false;
  return true;
}

/** Full structural similarity score (0..1) between two indexed units. */
export function similarityScore(a: CodeUnit, b: CodeUnit): number {
  if (!couldMatch(a.signature, b.signature)) return 0;
  return jaccard(a.shingles, b.shingles);
}
