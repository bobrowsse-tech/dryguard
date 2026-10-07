import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  CodeAction,
  CodeActionKind,
  InitializeResult,
  Range,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { WorkspaceIndex } from "@dryguard/core";

export const DIAGNOSTIC_SOURCE = "dryguard";
export const REFACTOR_COMMAND = "dryguard.refactorDuplicate";

interface DryGuardSettings {
  threshold: number;
  enable: boolean;
}

const DEFAULT_SETTINGS: DryGuardSettings = { threshold: 0.85, enable: true };

/** Runs the DryGuard language server over the given (or default stdio) connection. */
export function startServer(
  connection = createConnection(ProposedFeatures.all),
): void {
  const documents = new TextDocuments(TextDocument);
  let index: WorkspaceIndex | undefined;
  let settings: DryGuardSettings = DEFAULT_SETTINGS;
  // Cache of the last diagnostics we published per-uri, so code actions can
  // look up which match a given diagnostic referred to.
  const matchByDiagnosticKey = new Map<
    string,
    { filePath: string; startLine: number; endLine: number; name: string }
  >();

  connection.onInitialize((params): InitializeResult => {
    const rootDir =
      params.workspaceFolders?.[0]?.uri
        ? URI.parse(params.workspaceFolders[0].uri).fsPath
        : params.rootPath ?? process.cwd();

    void WorkspaceIndex.build({ rootDir }).then((built) => {
      index = built.index;
      connection.console.info(
        `[dryguard] indexed ${built.stats.unitsIndexed} units across ${built.stats.filesScanned} files in ${built.stats.durationMs}ms`,
      );
      // Re-lint anything already open now that the index is warm.
      for (const doc of documents.all()) lintDocument(doc);
    });

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        codeActionProvider: true,
      },
    };
  });

  connection.onDidChangeConfiguration((change) => {
    const incoming = (change.settings as { dryguard?: Partial<DryGuardSettings> })?.dryguard;
    settings = { ...DEFAULT_SETTINGS, ...incoming };
    for (const doc of documents.all()) lintDocument(doc);
  });

  documents.onDidOpen((e) => lintDocument(e.document));
  documents.onDidChangeContent((e) => lintDocument(e.document));
  documents.onDidClose((e) => {
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
    index?.removeFile(URI.parse(e.document.uri).fsPath);
  });

  function lintDocument(document: TextDocument): void {
    if (!index || !settings.enable) return;
    const filePath = URI.parse(document.uri).fsPath;

    // Re-index this file's current (possibly unsaved) contents so later
    // comparisons against it reflect what's on screen, then check every
    // function in it against the rest of the workspace.
    index.indexFile(filePath, document.getText());

    const result = index.checkSimilarity({
      code: document.getText(),
      filePath,
      threshold: settings.threshold,
      limit: 1000,
    });

    const diagnostics: Diagnostic[] = [];
    for (const match of result.matches) {
      // candidateRange pinpoints the function *in this document* that
      // triggered the match (present whenever the document has more than
      // one function); fall back to line 0 for a single-function snippet.
      const anchorLine = Math.max(0, (match.candidateRange?.startLine ?? 1) - 1);
      const anchorEndLine = Math.max(anchorLine, (match.candidateRange?.endLine ?? anchorLine + 1) - 1);
      const range: Range = {
        start: { line: anchorLine, character: 0 },
        end: { line: anchorEndLine, character: Number.MAX_SAFE_INTEGER },
      };
      const key = `${document.uri}:${match.candidateRange?.startLine ?? anchorLine}:${match.unit.startLine}`;
      matchByDiagnosticKey.set(key, {
        filePath: match.unit.filePath,
        startLine: match.unit.startLine,
        endLine: match.unit.endLine,
        name: match.unit.name,
      });

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range,
        message: `DRY violation: this looks ${Math.round(match.score * 100)}% structurally identical to '${match.unit.name}' in ${relative(match.unit.filePath)}:${match.unit.startLine}. Reuse or extract a shared helper instead of duplicating it.`,
        source: DIAGNOSTIC_SOURCE,
        code: key,
      });
    }

    connection.sendDiagnostics({ uri: document.uri, diagnostics });
  }

  connection.onCodeAction((params): CodeAction[] => {
    const actions: CodeAction[] = [];
    for (const diagnostic of params.context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE) continue;
      const match = matchByDiagnosticKey.get(String(diagnostic.code));
      if (!match) continue;

      actions.push({
        title: `DryGuard: View existing '${match.name}' (${relative(match.filePath)}:${match.startLine})`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: {
          title: "Open match",
          command: REFACTOR_COMMAND,
          arguments: [{ uri: params.textDocument.uri, diagnostic, match, mode: "navigate" }],
        },
      });

      actions.push({
        title: `DryGuard: Merge with '${match.name}' using the IDE's AI assistant`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        command: {
          title: "Refactor duplicate",
          command: REFACTOR_COMMAND,
          arguments: [{ uri: params.textDocument.uri, diagnostic, match, mode: "refactor" }],
        },
      });
    }
    return actions;
  });

  // The actual refactor (calling an LLM, computing a WorkspaceEdit) needs
  // IDE-specific capabilities (VS Code's vscode.lm API, JetBrains' AI
  // Assistant SDK, etc.) that plain LSP can't express. The language server
  // deliberately does NOT try to perform it — it just acknowledges the
  // command; the thin per-IDE client is what implements execution using the
  // match info the command carried.
  connection.onExecuteCommand((params) => {
    if (params.command === REFACTOR_COMMAND) {
      connection.console.info(`[dryguard] refactor command delegated to client: ${JSON.stringify(params.arguments)}`);
    }
  });

  documents.listen(connection);
  connection.listen();
}

function relative(p: string): string {
  const parts = p.split("/");
  return parts.slice(-2).join("/");
}
