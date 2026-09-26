import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceIndex } from "../index/workspaceIndex.js";

function ensureGrammars(): void {
  const wasm = join(process.cwd(), "packages", "core", "grammars", "python.wasm");
  if (!existsSync(wasm)) {
    execFileSync(process.execPath, ["scripts/fetch-grammars.mjs"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  }
}

function makeTempWorkspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dryguard-lang-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents, "utf8");
  }
  return dir;
}

const PYTHON_A = `
def calculate_tax(price, rate):
    if price <= 0:
        return 0
    tax = price * rate
    return tax + price
`;

const PYTHON_B = `
def compute_tax(amount, percentage):
    if amount <= 0:
        return 0
    total = amount * percentage
    return total + amount
`;

const GO_A = `
package billing

func CalculateTax(price float64, rate float64) float64 {
    if price <= 0 {
        return 0
    }
    tax := price * rate
    return tax + price
}
`;

const GO_B = `
package billing

func ComputeTax(amount float64, percentage float64) float64 {
    if amount <= 0 {
        return 0
    }
    total := amount * percentage
    return total + amount
}
`;

describe("tree-sitter adapters", () => {
  it("flags a renamed Python duplicate and a renamed Go duplicate", async () => {
    ensureGrammars();
    const dir = makeTempWorkspace({
      "a.py": PYTHON_A,
      "b.py": PYTHON_B,
      "a.go": GO_A,
      "b.go": GO_B,
    });

    const { index } = await WorkspaceIndex.build({ rootDir: dir });
    const matches = index.scanWorkspace();
    const python = matches.find((m) => m.unit.filePath.endsWith(".py"));
    const go = matches.find((m) => m.unit.filePath.endsWith(".go"));

    expect(python?.score ?? 0).toBeGreaterThanOrEqual(0.85);
    expect(go?.score ?? 0).toBeGreaterThanOrEqual(0.85);
  }, 20000);
});
