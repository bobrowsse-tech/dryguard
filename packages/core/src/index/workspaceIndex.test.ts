import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceIndex } from "./workspaceIndex.js";

function makeTempWorkspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dryguard-test-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents, "utf8");
  }
  return dir;
}

describe("WorkspaceIndex", () => {
  it("flags a renamed structural duplicate as similar", async () => {
    const dir = makeTempWorkspace({
      "billing.ts": `
        export function calculateTax(price: number, rate: number): number {
          if (price <= 0) {
            return 0;
          }
          const tax = price * rate;
          return tax + price;
        }
      `,
    });

    const { index } = await WorkspaceIndex.build({ rootDir: dir });

    const result = index.checkSimilarity({
      code: `
        function computeTax(amount: number, percentage: number): number {
          if (amount <= 0) {
            return 0;
          }
          const total = amount * percentage;
          return total + amount;
        }
      `,
    });

    expect(result.isDuplicate).toBe(true);
    expect(result.matches[0]?.unit.name).toBe("calculateTax");
    expect(result.matches[0]?.score).toBeGreaterThanOrEqual(0.85);
  });

  it("does not flag structurally different functions", async () => {
    const dir = makeTempWorkspace({
      "billing.ts": `
        export function calculateTax(price: number, rate: number): number {
          if (price <= 0) {
            return 0;
          }
          const tax = price * rate;
          return tax + price;
        }
      `,
    });

    const { index } = await WorkspaceIndex.build({ rootDir: dir });

    const result = index.checkSimilarity({
      code: `
        function fetchUserProfile(userId: string) {
          const cached = cache.get(userId);
          if (cached) {
            return cached;
          }
          for (const source of sources) {
            const profile = source.lookup(userId);
            if (profile) return profile;
          }
          return null;
        }
      `,
    });

    expect(result.isDuplicate).toBe(false);
  });
});
