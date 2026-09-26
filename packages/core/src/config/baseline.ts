import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BaselineEntry, BaselineFile, MatchType } from "../types.js";

/** Order-independent key for a pair of unit ids, so a↔b and b↔a collide. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("||");
}

export function loadBaseline(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as BaselineFile;
  return new Set(parsed.entries.map((e) => pairKey(e.a, e.b)));
}

export function saveBaseline(path: string, entries: BaselineEntry[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const file: BaselineFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export function makeBaselineEntry(a: string, b: string, matchType: MatchType, score: number): BaselineEntry {
  return { a, b, matchType, score: Math.round(score * 1000) / 1000 };
}
