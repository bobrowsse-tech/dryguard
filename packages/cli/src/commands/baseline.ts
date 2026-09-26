import { resolve, join } from "node:path";
import { WorkspaceIndex, loadConfig, saveBaseline, makeBaselineEntry } from "@dryguard/core";

export interface BaselineOptions {
  rootDir: string;
  threshold?: number;
  semantic?: boolean;
  semanticThreshold?: number;
}

/**
 * Snapshots every current duplicate in the workspace into the baseline
 * file, so adopting DryGuard on a codebase that already has known
 * duplication doesn't fail CI on day one — only *new* duplicates (ones not
 * in this snapshot) will be flagged going forward. Re-run this deliberately
 * (not automatically) whenever the team accepts a new piece of duplication
 * on purpose.
 */
export async function runBaseline(options: BaselineOptions): Promise<{ output: string; path: string }> {
  const rootDir = resolve(options.rootDir);
  const config = loadConfig(rootDir);
  // Baseline snapshot must see everything, including what a future `.dryguardrc.json`
  // baseline exclusion would otherwise hide, so we build with useBaseline effectively off
  // by using a fresh index whose baseline set is empty (no prior baseline file consulted
  // here — scanWorkspace still checks `this.baseline`, but a first-run baseline path with
  // no existing file starts empty anyway).
  const { index } = await WorkspaceIndex.build({ rootDir });

  const matches = index.scanWorkspace({
    threshold: options.threshold,
    semantic: options.semantic,
    semanticThreshold: options.semanticThreshold,
  });

  const entries = matches
    .filter((m) => m.candidateRange)
    .map((m) =>
      makeBaselineEntry(
        `${m.unit.filePath}#${m.candidateRange!.name}@${m.candidateRange!.startLine}`,
        m.unit.id,
        m.matchType,
        m.score,
      ),
    );

  const path =
    config.baselinePath === false ? join(rootDir, ".dryguard", "baseline.json") : join(rootDir, config.baselinePath);
  saveBaseline(path, entries);

  return {
    output: `Wrote ${entries.length} accepted duplicate${entries.length === 1 ? "" : "s"} to ${path}`,
    path,
  };
}
