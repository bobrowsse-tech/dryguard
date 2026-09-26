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

describe("WorkspaceIndex — ignore comments", () => {
  it("does not index a function marked with the ignore comment", async () => {
    const dir = makeTempWorkspace({
      "billing.ts": `
        // dryguard-ignore
        export function calculateTax(price: number, rate: number): number {
          if (price <= 0) { return 0; }
          const tax = price * rate;
          return tax + price;
        }
      `,
    });

    const { index } = await WorkspaceIndex.build({ rootDir: dir });

    const result = index.checkSimilarity({
      code: `
        function computeTax(amount: number, percentage: number): number {
          if (amount <= 0) { return 0; }
          const total = amount * percentage;
          return total + amount;
        }
      `,
    });

    expect(result.isDuplicate).toBe(false);
  });
});

describe("WorkspaceIndex — semantic tier", () => {
  it("flags functions with different structure but the same referenced APIs, when enabled", async () => {
    const dir = makeTempWorkspace({
      "users.ts": `
        export function loadActiveUsers(db: Database): User[] {
          const rows = db.query("SELECT * FROM users WHERE active = true");
          return rows.map((row) => new User(row));
        }
      `,
    });

    const { index } = await WorkspaceIndex.build({ rootDir: dir });

    // Structurally different (reduce vs. map+filter), same underlying calls/names.
    const result = index.checkSimilarity({
      code: `
        function fetchEnabledUsers(database: Database): User[] {
          const rows = database.query("SELECT * FROM users WHERE active = true");
          const users: User[] = [];
          for (const row of rows) {
            users.push(new User(row));
          }
          return users;
        }
      `,
      semantic: true,
      semanticThreshold: 0.5,
    });

    expect(result.matches.some((m) => m.matchType === "semantic")).toBe(true);
  });
});
