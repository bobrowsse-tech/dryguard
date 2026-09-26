import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runScan } from "./scan.js";

function makeTempWorkspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dryguard-cli-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents, "utf8");
  }
  return dir;
}

const TAX = (name: string, a: string, b: string, local: string) => `
  export function ${name}(${a}: number, ${b}: number): number {
    if (${a} <= 0) {
      return 0;
    }
    const ${local} = ${a} * ${b};
    return ${local} + ${a};
  }
`;

describe("dryguard scan", () => {
  it("exits 1 when two files contain a structural duplicate", async () => {
    const dir = makeTempWorkspace({
      "a.ts": TAX("calculateTax", "price", "rate", "tax"),
      "b.ts": TAX("computeTax", "amount", "percentage", "total"),
    });

    const { output, exitCode } = await runScan({ rootDir: dir, format: "json" });
    const report = JSON.parse(output) as { duplicateCount: number };

    expect(exitCode).toBe(1);
    expect(report.duplicateCount).toBeGreaterThan(0);
  });

  it("exits 0 when the functions are unrelated", async () => {
    const dir = makeTempWorkspace({
      "a.ts": TAX("calculateTax", "price", "rate", "tax"),
      "b.ts": `
        export function formatUser(first: string, last: string): string {
          const trimmed = first.trim();
          const surname = last.trim();
          return trimmed + " " + surname;
        }
      `,
    });

    const { output, exitCode } = await runScan({ rootDir: dir, format: "json" });
    const report = JSON.parse(output) as { duplicateCount: number };

    expect(exitCode).toBe(0);
    expect(report.duplicateCount).toBe(0);
  });
});
