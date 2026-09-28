# DryGuard

![DryGuard](./images/icon.png)

DryGuard warns you when a function you just wrote — or that an AI agent just wrote — is structurally the same as one already in the workspace. It underlines the new function and tells you where the existing one lives, so the duplicate can be reused or merged before it lands.

It is a warning, not a build error. Saving the file still works. Nothing is rewritten unless you accept a quick fix.

## Install

Install **DryGuard** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.dryguard-vscode) or [Open VSX](https://open-vsx.org/extension/bobrowsse-tech/dryguard-vscode). The same package runs in VS Code, Cursor, Windsurf, and VSCodium.

It starts on its own when you open a TypeScript, JavaScript, Python, or Go file. The first index of a large repo is the slow one. Later runs reuse a cache and only re-parse files that changed.

## What you will see

A yellow warning on the duplicate function, for example:

```text
DRY violation: this looks 92% structurally identical to 'calculateTax' in src/billing.ts:14
```

The percentage is a structural score from 0 to 1. The default line is **0.85** (85%). Below that, DryGuard stays quiet.

Two quick fixes appear on that warning:

1. **View existing 'calculateTax'** — opens the function that already exists and puts the cursor on it. DryGuard does not change any code.
2. **Merge with 'calculateTax' using the IDE's AI assistant** — asks GitHub Copilot's language model in this editor to merge the two functions, then applies the result as a workspace edit. Read the diff before you keep it. If Copilot is not signed in, DryGuard does not edit anything: it opens the existing function beside the new one and shows a warning.

## What DryGuard leaves alone

- One-line helpers and stubs. A function is indexed when it has at least three statements, or a branch or loop.
- Matches under your threshold.
- Duplicates you already accepted with `npx @dryguard/cli baseline .` (the snapshot is `.dryguard/baseline.json`).
- A function with a `dryguard-ignore` comment on the line above it. The TypeScript and JavaScript form is `// dryguard-ignore`.
- Files outside the include globs, including `node_modules`, `dist`, and declaration files.

The structural check compares the shape of the code, so a renamed copy still matches. A looser semantic check (same APIs, different shape, such as a `for` loop versus `.reduce()`) stays off until you enable it. It raises more false positives, so keep the threshold high if you turn it on.

## Settings

In the editor, under **DryGuard**:

| Setting | Default | Effect |
|---|---|---|
| `dryguard.enable` | `true` | Turn diagnostics on or off. |
| `dryguard.threshold` | `0.85` | Structural score required to warn. |

Repo-wide rules live in `.dryguardrc.json` at the project root. `npx @dryguard/cli init` writes a starter file. That file is what CI, the MCP server, and this extension share: threshold, include and exclude globs, the ignore comment, the cache path, and the baseline path. Set `semanticTier.enabled` to `true` there if you want the looser check in the editor as well.

Command palette: **DryGuard: Re-index Workspace**. Use it after a big rename or after you change `.dryguardrc.json` and the warnings look stale.

## Ignoring one function

```ts
// dryguard-ignore
function calculateShippingTax(amount: number): number {
  // same shape as calculateTax, different meaning — leave it
}
```

## Adopting this on a repo that already has copies

```bash
npx @dryguard/cli baseline .
```

Commit `.dryguard/baseline.json`. From then on, only new duplicates are flagged. Re-run baseline only when the team has agreed to keep a new copy.

## Other ways to run the same engine

- **AI agents (MCP):** `npx -y @dryguard/mcp-server` exposes `index_workspace`, `check_similarity`, and `get_refactor_suggestion`. The agent is supposed to check a proposed function before writing it.
- **CI:** `npx @dryguard/cli scan .` prints a report and exits 1 when it finds a duplicate that is not in the baseline. `--format markdown` is meant for a pull-request summary.
- **Other editors:** `npx -y @dryguard/lsp-server` speaks LSP. Neovim and JetBrains setup is in the [repository usage guide](https://github.com/bobrowsse-tech/dryguard/blob/main/docs/HOW_TO_USE.md).

The full configuration reference, pre-commit hook, and language notes are in that same guide.
