import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { WorkspaceIndex } from "@dryguard/core";
import { formatReport } from "../report.js";

export interface PrecommitOptions {
  rootDir: string;
  /** Explicit file list (as the `pre-commit` framework passes them). Falls back to staged files. */
  files?: string[];
  threshold?: number;
  semantic?: boolean;
}

/**
 * Scoped scan for a pre-commit hook: only flags a duplicate if at least one
 * side of the match is among the files actually being committed, so an
 * unrelated pre-existing duplicate elsewhere in the repo never blocks an
 * unrelated commit — only genuinely new duplication does.
 */
export async function runPrecommit(options: PrecommitOptions): Promise<{ output: string; exitCode: number }> {
  const rootDir = resolve(options.rootDir);
  const changedFiles = new Set(
    (options.files && options.files.length > 0 ? options.files : getStagedFiles(rootDir)).map((f) =>
      resolve(rootDir, f),
    ),
  );

  if (changedFiles.size === 0) {
    return { output: "DryGuard: no staged files to check.", exitCode: 0 };
  }

  const { index, stats } = await WorkspaceIndex.build({ rootDir });
  const matches = index
    .scanWorkspace({ threshold: options.threshold, semantic: options.semantic })
    .filter((m) => changedFiles.has(m.unit.filePath) || changedFiles.has(m.candidateRange?.filePath ?? ""));

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
    "text",
  );

  return { output, exitCode: matches.length > 0 ? 1 : 0 };
}

function getStagedFiles(rootDir: string): string[] {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: rootDir,
      encoding: "utf8",
    });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
