import pc from "picocolors";
import type { SimilarityMatch } from "@dryguard/core";

export type ReportFormat = "text" | "json" | "markdown";

export interface ScanReportInput {
  rootDir: string;
  matches: SimilarityMatch[];
  threshold: number;
  semanticEnabled: boolean;
  durationMs: number;
  filesScanned: number;
  unitsIndexed: number;
}

export function formatReport(input: ScanReportInput, format: ReportFormat): string {
  switch (format) {
    case "json":
      return formatJson(input);
    case "markdown":
      return formatMarkdown(input);
    default:
      return formatText(input);
  }
}

function formatJson(input: ScanReportInput): string {
  return JSON.stringify(
    {
      threshold: input.threshold,
      semanticEnabled: input.semanticEnabled,
      filesScanned: input.filesScanned,
      unitsIndexed: input.unitsIndexed,
      durationMs: input.durationMs,
      duplicateCount: input.matches.length,
      duplicates: input.matches.map(serializeMatch),
    },
    null,
    2,
  );
}

function formatText(input: ScanReportInput): string {
  const lines: string[] = [];
  lines.push(
    pc.bold(
      `DryGuard scan: ${input.filesScanned} files, ${input.unitsIndexed} functions indexed in ${input.durationMs}ms`,
    ),
  );

  if (input.matches.length === 0) {
    lines.push(pc.green("No duplicates above threshold. ✓"));
    return lines.join("\n");
  }

  lines.push(
    pc.yellow(`${input.matches.length} potential duplicate${input.matches.length === 1 ? "" : "s"} found:`),
    "",
  );

  for (const match of input.matches) {
    const badge = match.matchType === "structural" ? pc.red("STRUCTURAL") : pc.magenta("SEMANTIC");
    const pct = `${Math.round(match.score * 100)}%`;
    const candidate = match.candidateRange
      ? `${match.candidateRange.name} (:${match.candidateRange.startLine})`
      : "<candidate>";
    lines.push(
      `${badge} ${pc.bold(pct)}  ${candidate}  ${pc.dim("~")}  ${match.unit.name} (${match.unit.filePath}:${match.unit.startLine})`,
    );
  }

  return lines.join("\n");
}

function formatMarkdown(input: ScanReportInput): string {
  if (input.matches.length === 0) {
    return `**DryGuard**: no duplicates above threshold across ${input.filesScanned} files, ${input.unitsIndexed} functions. ✓`;
  }

  const rows = input.matches
    .map((m) => {
      const candidate = m.candidateRange
        ? `\`${m.candidateRange.name}\` (${m.candidateRange.startLine})`
        : "candidate";
      return `| ${m.matchType} | ${Math.round(m.score * 100)}% | ${candidate} | \`${m.unit.name}\` (\`${m.unit.filePath}:${m.unit.startLine}\`) |`;
    })
    .join("\n");

  return [
    `**DryGuard** found ${input.matches.length} potential duplicate${input.matches.length === 1 ? "" : "s"} (${input.filesScanned} files scanned):`,
    "",
    "| Type | Score | New/changed | Existing match |",
    "|---|---|---|---|",
    rows,
  ].join("\n");
}

function serializeMatch(match: SimilarityMatch) {
  return {
    matchType: match.matchType,
    score: Math.round(match.score * 1000) / 1000,
    candidate: match.candidateRange,
    existing: {
      name: match.unit.name,
      filePath: match.unit.filePath,
      startLine: match.unit.startLine,
      endLine: match.unit.endLine,
    },
  };
}
