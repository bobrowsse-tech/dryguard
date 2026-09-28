# @dryguard/lsp-server

<p align="center">
  <img src="https://github.com/bobrowsse-tech/dryguard/raw/main/packages/vscode-extension/images/icon.png" width="96" alt="DryGuard">
</p>

Language server for DryGuard. It publishes a **warning** when an open function is structurally the same as one already in the workspace, and it offers code actions on that warning.

```bash
npx -y @dryguard/lsp-server
```

Point an LSP client at that command for `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, and `.go` files. The VS Code extension, the JetBrains plugin, and the Neovim config all launch this server for you.

## What you will see

```text
DRY violation: this looks 92% structurally identical to 'calculateTax' in src/billing.ts:14
```

The diagnostic severity is warning. DryGuard does not fail the language server or block the editor from saving the file. The default score required is **0.85**. Functions with fewer than three statements and no branch or loop are not compared.

Code actions:

- **DryGuard: View existing 'name'** — the client should open the original function. No text is changed.
- **DryGuard: Merge with 'name' using the IDE's AI assistant** — the server only sends the command. The VS Code extension is what calls GitHub Copilot and applies a workspace edit. If Copilot is not available, that extension opens the existing function beside the new one and does not edit. Other editors can implement the same command or ignore it; the warning and the "view existing" action still work.

Repo rules (threshold, globs, ignore comment, baseline) come from `.dryguardrc.json`. See [How to use DryGuard](https://github.com/bobrowsse-tech/dryguard/blob/main/docs/HOW_TO_USE.md).
