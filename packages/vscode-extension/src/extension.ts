import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";
import { runAiAssistedMerge } from "./refactor.js";

/**
 * Must stay identical to `REFACTOR_COMMAND` in `@dryguard/lsp-server`.
 * Imported as a literal so the extension host bundle does not inline the
 * language server; the server runs as its own Node process.
 */
const REFACTOR_COMMAND = "dryguard.refactorDuplicate";

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.mjs"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6019"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: "typescript" },
      { language: "typescriptreact" },
      { language: "javascript" },
      { language: "javascriptreact" },
    ],
    synchronize: {
      configurationSection: "dryguard",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx}"),
    },
    initializationOptions: {
      threshold: vscode.workspace.getConfiguration("dryguard").get("threshold"),
    },
  };

  client = new LanguageClient("dryguard", "DryGuard", serverOptions, clientOptions);

  // This is the piece plain LSP cannot express: when the server's code
  // action fires the refactor command, VS Code (not the language server)
  // is what has access to the IDE's own LLM via vscode.lm and to
  // workspace.applyEdit, so the client implements it here.
  context.subscriptions.push(
    vscode.commands.registerCommand(REFACTOR_COMMAND, async (args) => {
      if (args?.mode === "navigate") {
        const uri = vscode.Uri.file(args.match.filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(
            Math.max(0, args.match.startLine - 1),
            0,
            Math.max(0, args.match.startLine - 1),
            0,
          ),
        });
        return;
      }
      if (args?.mode === "refactor") {
        await runAiAssistedMerge(args);
      }
    }),
    vscode.commands.registerCommand("dryguard.reindexWorkspace", async () => {
      await client?.sendNotification("workspace/didChangeConfiguration", { settings: {} });
      vscode.window.showInformationMessage("DryGuard: workspace re-index requested.");
    }),
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
