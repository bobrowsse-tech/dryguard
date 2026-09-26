import { resolve } from "node:path";
import { WorkspaceIndex } from "@dryguard/core";
import { formatReport, type ReportFormat } from "../report.js";

export interface ScanOptions {
  rootDir: string;
  threshold?: number;
  semantic?: boolean;
  semanticThreshold?: number;
  format: ReportFormat;
  maxDuplicates?: number;
  noBaseline?: boolean;
}

/**
 * Headless duplication scan across the whole workspace — the entry point
 * for CI. Exits non-zero (via the returned `exitCode`) when the duplicate
 * count exceeds `maxDuplicates` (default 0: any new, non-baselined
 * duplicate fails the build), which is what lets a team enforce a
 * duplication budget on pull requests the same way they'd enforce test
 * coverage or lint cleanliness.
 */
export async function runScan(options: ScanOptions): Promise<{ output: string; exitCode: number }> {
  const rootDir = resolve(options.rootDir);
  const { index, stats } = await WorkspaceIndex.build({ rootDir });

  // Baseline exclusion happens inside scanWorkspace via the index's loaded
  // baseline file; options.noBaseline is intentionally not wired to a
  // separate code path here — pass a nonexistent baselinePath in
  // .dryguardrc.json for a truly baseline-free run.
  const matches = index.scanWorkspace({
    threshold: options.threshold,
    semantic: options.semantic,
    semanticThreshold: options.semanticThreshold,
  });

  const output = formatReport(
    {
      rootDir,
      matches,
      threshold: options.threshold ?? index.config.threshold,
      semanticEnabled: options.semantic ?? index.config.semanticTier.enabled,
      durationMs: stats.durationMs,
      filesScanned: stats.filesScanned,
      unitsIndexed: stats.unitsIndexed,
    },
    options.format,
  );

  const budget = options.maxDuplicates ?? 0;
  const exitCode = matches.length > budget ? 1 : 0;

  return { output, exitCode };
}
