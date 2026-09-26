import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WorkspaceIndex } from "@dryguard/core";
import { z } from "zod";

const IndexWorkspaceInput = z.object({
  rootDir: z.string().describe("Absolute path to the project/workspace root to index."),
});

const CheckSimilarityInput = z.object({
  code: z
    .string()
    .describe("The function or code snippet you are about to write, as source text."),
  filePath: z
    .string()
    .optional()
    .describe("Path the code is destined for, if known. Used to avoid self-matches."),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Similarity threshold (0-1) above which a match counts as a duplicate. Default 0.85."),
  limit: z.number().int().positive().optional().describe("Max matches to return. Default 5."),
});

const GetRefactorSuggestionInput = z.object({
  code: z.string().describe("The newly proposed code that was flagged as a duplicate."),
  filePath: z.string().optional(),
});

/**
 * Builds the DryGuard MCP server. One index is held per server process,
 * scoped to whichever workspace the client asks to index first — an agent
 * calls `index_workspace` once at session start, then `check_similarity`
 * before writing each new function.
 */
export function createDryGuardServer(): Server {
  const server = new Server(
    { name: "dryguard", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  let index: WorkspaceIndex | undefined;
  let indexedRoot: string | undefined;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "index_workspace",
        description:
          "Builds (or rebuilds) DryGuard's structural code index for a workspace. " +
          "Call this once before the first check_similarity call in a session, " +
          "or again after large-scale changes (branch switch, generated code, etc).",
        inputSchema: {
          type: "object",
          properties: { rootDir: { type: "string" } },
          required: ["rootDir"],
        },
      },
      {
        name: "check_similarity",
        description:
          "Checks a proposed function or code snippet against the indexed workspace for " +
          "structural (near-)duplicates BEFORE you write it to a file. Call this as part of " +
          "planning any new function: if it returns isDuplicate=true, reuse or extend the " +
          "existing match instead of writing new code. This is the primary DRY-enforcement tool.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string" },
            filePath: { type: "string" },
            threshold: { type: "number" },
            limit: { type: "number" },
          },
          required: ["code"],
        },
      },
      {
        name: "get_refactor_suggestion",
        description:
          "Given code that check_similarity flagged as a duplicate, returns the exact location " +
          "and source of the existing match plus a structured suggestion for how to consolidate " +
          "them (extract shared helper, parameterize the difference, or reuse directly). Use this " +
          "to decide HOW to fix a DRY violation once one is found.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string" },
            filePath: { type: "string" },
          },
          required: ["code"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "index_workspace": {
        const input = IndexWorkspaceInput.parse(args);
        const built = await WorkspaceIndex.build({ rootDir: input.rootDir });
        index = built.index;
        indexedRoot = input.rootDir;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ rootDir: input.rootDir, ...built.stats }),
            },
          ],
        };
      }

      case "check_similarity": {
        const input = CheckSimilarityInput.parse(args);
        if (!index) {
          return errorResult(
            "No workspace has been indexed yet. Call index_workspace with the project root first.",
          );
        }
        const result = index.checkSimilarity(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  isDuplicate: result.isDuplicate,
                  threshold: result.threshold,
                  matches: result.matches.map((m) => ({
                    score: Math.round(m.score * 100) / 100,
                    name: m.unit.name,
                    filePath: m.unit.filePath,
                    startLine: m.unit.startLine,
                    endLine: m.unit.endLine,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_refactor_suggestion": {
        const input = GetRefactorSuggestionInput.parse(args);
        if (!index) {
          return errorResult(
            "No workspace has been indexed yet. Call index_workspace with the project root first.",
          );
        }
        const result = index.checkSimilarity({ ...input, threshold: 0.6, limit: 1 });
        const top = result.matches[0];
        if (!top) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  suggestion: "no-close-match",
                  message: "No sufficiently similar existing code was found; write the new function as-is.",
                }),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  suggestion: top.score >= 0.95 ? "reuse-directly" : "extract-shared-helper",
                  existingMatch: {
                    filePath: top.unit.filePath,
                    startLine: top.unit.startLine,
                    endLine: top.unit.endLine,
                    name: top.unit.name,
                    source: top.unit.sourceText,
                  },
                  guidance:
                    top.score >= 0.95
                      ? `This is effectively identical to '${top.unit.name}' in ${top.unit.filePath}:${top.unit.startLine}. Import and reuse it instead of writing a new function.`
                      : `This closely mirrors '${top.unit.name}' in ${top.unit.filePath}:${top.unit.startLine} (score ${top.score.toFixed(2)}). Extract the shared logic into a single parameterized helper (e.g. in a shared/utils module), update both call sites to use it, and remove the duplicate.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  });

  return server;
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export async function main(): Promise<void> {
  const server = createDryGuardServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
