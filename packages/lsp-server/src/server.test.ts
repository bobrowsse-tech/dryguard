import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node.js";
import { describe, expect, it, vi } from "vitest";
import { DIAGNOSTIC_SOURCE, startServer } from "./server.js";

interface LspMessage {
  id?: number;
  method?: string;
  params?: {
    diagnostics?: Array<{ source?: string; message?: string }>;
  };
}

class LspReader {
  private buffer = Buffer.alloc(0);
  private queue: LspMessage[] = [];
  private waiters: Array<(message: LspMessage) => void> = [];

  constructor(stream: PassThrough) {
    stream.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match?.[1]) return;
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      const message = JSON.parse(body) as LspMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(message);
      else this.queue.push(message);
    }
  }

  next(timeoutMs: number): Promise<LspMessage> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for an LSP message")), timeoutMs);
      this.waiters.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }
}

function encode(message: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, "ascii"), json]);
}

describe("DryGuard language server", () => {
  it("publishes a diagnostic when an open file duplicates an indexed function", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dryguard-lsp-"));
    writeFileSync(
      join(dir, "billing.ts"),
      `
        export function calculateTax(price: number, rate: number): number {
          if (price <= 0) {
            return 0;
          }
          const tax = price * rate;
          return tax + price;
        }
      `,
      "utf8",
    );

    const duplicate = `
      export function computeTax(amount: number, percentage: number): number {
        if (amount <= 0) {
          return 0;
        }
        const total = amount * percentage;
        return total + amount;
      }
    `;
    const openPath = join(dir, "other.ts");
    const rootUri = pathToFileURL(dir).href;
    const openUri = pathToFileURL(openPath).href;

    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const reader = new LspReader(serverToClient);
    const connection = createConnection(ProposedFeatures.all, clientToServer, serverToClient);
    startServer(connection);

    try {
      clientToServer.write(
        encode({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            processId: process.pid,
            rootUri,
            workspaceFolders: [{ uri: rootUri, name: "fixture" }],
            capabilities: {},
          },
        }),
      );

      const deadline = Date.now() + 15000;
      let initialized = false;
      let diagnosticMessage = "";
      while (Date.now() < deadline) {
        const message = await reader.next(deadline - Date.now());
        if (message.id === 1) {
          clientToServer.write(encode({ jsonrpc: "2.0", method: "initialized", params: {} }));
          clientToServer.write(
            encode({
              jsonrpc: "2.0",
              method: "textDocument/didOpen",
              params: {
                textDocument: { uri: openUri, languageId: "typescript", version: 1, text: duplicate },
              },
            }),
          );
          initialized = true;
        }
        const diagnostics = message.params?.diagnostics;
        const hit = diagnostics?.find((item) => item.source === DIAGNOSTIC_SOURCE);
        if (hit?.message) {
          diagnosticMessage = hit.message;
          break;
        }
      }

      expect(initialized).toBe(true);
      expect(diagnosticMessage).toContain("calculateTax");
    } finally {
      // vscode-languageserver calls process.exit when its input stream
      // closes. Swallow that so the test process stays alive.
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      clientToServer.write(encode({ jsonrpc: "2.0", id: 2, method: "shutdown", params: null }));
      clientToServer.end();
      await new Promise((resolve) => setTimeout(resolve, 50));
      connection.dispose();
      serverToClient.end();
      exitSpy.mockRestore();
    }
  }, 20000);
});
