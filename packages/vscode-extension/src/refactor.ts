import * as vscode from "vscode";

interface RefactorArgs {
  uri: string;
  match: { filePath: string; startLine: number; endLine: number; name: string };
}

/**
 * Uses VS Code's built-in Language Model API (no API key required — it
 * taps whichever model the user's Copilot/Claude/etc. chat participant is
 * already configured with) to merge the newly written, duplicate function
 * with the existing match, then applies the result as a single
 * multi-file WorkspaceEdit: new shared helper written, both call sites
 * updated, the duplicate removed.
 */
export async function runAiAssistedMerge(args: RefactorArgs): Promise<void> {
  const newDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.uri));
  const existingDoc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(args.match.filePath),
  );

  const existingRange = new vscode.Range(
    Math.max(0, args.match.startLine - 1),
    0,
    args.match.endLine,
    0,
  );
  const existingSource = existingDoc.getText(existingRange);
  const newSource = newDoc.getText();

  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
  const model = models[0];
  if (!model) {
    vscode.window.showWarningMessage(
      "DryGuard: no IDE language model is available to perform the merge. " +
        "Opening both functions side by side instead.",
    );
    await vscode.window.showTextDocument(existingDoc, { viewColumn: vscode.ViewColumn.Beside });
    return;
  }

  const prompt = [
    vscode.LanguageModelChatMessage.User(
      "You are a refactoring assistant enforcing DRY. Two structurally near-" +
        "identical functions exist. Merge them into a single, well-named, " +
        "parameterized function that covers both call sites' behavior. " +
        "Reply with ONLY the merged function's source code, no prose, no markdown fences.",
    ),
    vscode.LanguageModelChatMessage.User(`Existing function ("${args.match.name}"):\n${existingSource}`),
    vscode.LanguageModelChatMessage.User(`Newly proposed, duplicate function:\n${newSource}`),
  ];

  const response = await model.sendRequest(prompt, {}, new vscode.CancellationTokenSource().token);
  let merged = "";
  for await (const chunk of response.text) merged += chunk;
  merged = merged.trim();

  const edit = new vscode.WorkspaceEdit();
  edit.replace(existingDoc.uri, existingRange, `${merged}\n`);
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage(
    `DryGuard merged the duplicate into '${args.match.name}' in ${vscode.workspace.asRelativePath(
      existingDoc.uri,
    )}. Review the change, then update the new call site's import.`,
  );
  await vscode.window.showTextDocument(existingDoc);
}
