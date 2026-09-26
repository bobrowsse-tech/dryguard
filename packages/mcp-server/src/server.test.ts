import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createDryGuardServer } from "./server.js";

function makeTempWorkspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dryguard-mcp-"));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents, "utf8");
  }
  return dir;
}

function textOf(result: unknown): string {
  if (typeof result !== "object" || result === null || !("content" in result) || !Array.isArray(result.content)) {
    throw new Error("tool result had no text content");
  }
  for (const item of result.content) {
    if (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      return item.text;
    }
  }
  throw new Error("tool result had no text content");
}

describe("DryGuard MCP server", () => {
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  it("indexes a workspace and flags a proposed duplicate", async () => {
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

    const server = createDryGuardServer();
    const client = new Client({ name: "dryguard-test", version: "0.0.0" }, { capabilities: {} });
    clients.push(client);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["index_workspace", "check_similarity", "get_refactor_suggestion"]),
    );

    const indexed = await client.callTool({
      name: "index_workspace",
      arguments: { rootDir: dir, watch: false },
    });
    const stats = JSON.parse(textOf(indexed)) as { unitsIndexed: number };
    expect(stats.unitsIndexed).toBeGreaterThan(0);

    const checked = await client.callTool({
      name: "check_similarity",
      arguments: {
        code: `
          function computeTax(amount: number, percentage: number): number {
            if (amount <= 0) {
              return 0;
            }
            const total = amount * percentage;
            return total + amount;
          }
        `,
      },
    });
    const result = JSON.parse(textOf(checked)) as { isDuplicate: boolean; matches: Array<{ name: string }> };
    expect(result.isDuplicate).toBe(true);
    expect(result.matches.some((match) => match.name === "calculateTax")).toBe(true);
  });
});
