# How to use DryGuard

This is the full usage guide across every surface. If you just want the
five-minute version, the [README](../README.md) covers the common cases;
come here for configuration, adoption on an existing codebase, CI, and
per-editor setup.

## 1. Install once, use everywhere

Every surface below reads the same [`.dryguardrc.json`](#configuration) and
shares one detection engine (`@dryguard/core`) — you configure duplication
rules once per repo, not once per editor.

## 2. As an AI agent (MCP)

Point any MCP-capable agent (Claude Code, Cursor, Copilot Workspace, Roo
Code, ...) at the server:

```json
{
  "mcpServers": {
    "dryguard": {
      "command": "npx",
      "args": ["-y", "@dryguard/mcp-server"]
    }
  }
}
```

Tools exposed:

| Tool | When to call it |
|---|---|
| `index_workspace` | Once per session, with the project root. Also starts a file watcher by default (`watch: true`), so the index stays current as the agent writes files — you should not need to call this again mid-session. |
| `check_similarity` | Before writing any new function. Pass the proposed code; if `isDuplicate: true`, reuse the match instead. |
| `get_refactor_suggestion` | Once `check_similarity` flags a duplicate, call this to get the existing function's full source plus a suggestion (`reuse-directly` vs `extract-shared-helper`). |

`check_similarity` also accepts `semantic: true` to additionally run the
looser, heuristic semantic tier (see [Similarity tiers](#similarity-tiers)).

## 3. As a human, in an editor

| Editor | How |
|---|---|
| VS Code / Cursor / Windsurf | Install "DryGuard" from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bobrowsse-tech.dryguard-vscode) or [Open VSX](https://open-vsx.org/extension/bobrowsse-tech/dryguard-vscode). Activates automatically for JS/TS/Python/Go. |
| Neovim | See [`editors/nvim/README.md`](../editors/nvim/README.md) — a copy-paste `nvim-lspconfig` config, no separate plugin needed. |
| JetBrains (IntelliJ, PyCharm, GoLand, WebStorm, ...) | Install [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij), then the DryGuard plugin (see [`packages/jetbrains-plugin`](../packages/jetbrains-plugin)). |
| Sublime, Helix, Emacs, anything else with LSP support | Point its LSP client config at `npx @dryguard/lsp-server` (stdio) for `.ts/.tsx/.js/.jsx/.py/.go` files. |

Code actions on a flagged duplicate:
- **View existing match** — jumps to the original function.
- **Merge with the IDE's AI assistant** (VS Code only, via `vscode.lm`) — asks whichever model your Copilot/Claude/etc. chat is already using to merge the two functions, then applies the result as a workspace edit.

## 4. In CI (headless)

```bash
npx @dryguard/cli scan .                       # human-readable report, exits 1 if anything new is found
npx @dryguard/cli scan . --format json          # machine-readable, for tooling
npx @dryguard/cli scan . --format markdown       # paste into a PR comment / GitHub Actions job summary
npx @dryguard/cli scan . --semantic               # also run the looser semantic tier
npx @dryguard/cli scan . --max-duplicates 5      # duplication "budget": only fail if it grows past 5
```

Example GitHub Actions step:

```yaml
- run: npx @dryguard/cli scan . --format markdown >> "$GITHUB_STEP_SUMMARY"
- run: npx @dryguard/cli scan .   # fails the job on new duplication
```

## 5. Pre-commit hook

Two ways to wire this in, pick one:

**Using the [pre-commit](https://pre-commit.com) framework:**

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/bobrowsse-tech/dryguard
    rev: v0.1.0
    hooks:
      - id: dryguard
```

**Plain git hook, no extra framework:**

```bash
./scripts/install-git-hook.sh
```

Either way, only duplicates touching files you're actually committing are
flagged — pre-existing duplication elsewhere in the repo never blocks an
unrelated commit.

## 6. Adopting DryGuard on an existing codebase (baseline)

Turning this on for the first time in a large, already-duplicated codebase
would otherwise flag hundreds of pre-existing matches. Snapshot what's
already there as "accepted", so only *new* duplication is flagged from here
on:

```bash
npx @dryguard/cli baseline .
```

This writes `.dryguard/baseline.json` (commit it). Every scan, precommit
check, and `check_similarity` call after this will silently skip anything in
that snapshot. Re-run `dryguard baseline` deliberately whenever the team
knowingly accepts a new piece of duplication (e.g. a deliberate copy during
a migration) — don't run it reflexively, or it stops meaning anything.

## Configuration

Create `.dryguardrc.json` at your repo root (`npx @dryguard/cli init` writes
a starter one):

```json
{
  "threshold": 0.85,
  "semanticTier": { "enabled": false, "threshold": 0.7 },
  "exclude": ["**/node_modules/**", "**/dist/**", "**/*.test.*"],
  "ignoreComment": "dryguard-ignore",
  "cachePath": ".dryguard/cache.json",
  "baselinePath": ".dryguard/baseline.json"
}
```

| Key | Default | Meaning |
|---|---|---|
| `threshold` | `0.85` | Structural (AST) similarity score (0–1) required to flag a duplicate. |
| `semanticTier.enabled` | `false` | Turn on the looser identifier/API-overlap tier everywhere (editors, MCP, CLI) without passing `--semantic`/`semantic: true` each time. |
| `semanticTier.threshold` | `0.7` | Score required for a semantic match. |
| `include` / `exclude` | see [`config.ts`](../packages/core/src/config/config.ts) | Glob patterns for which files get indexed. |
| `ignoreComment` | `"dryguard-ignore"` | See [Ignoring specific functions](#ignoring-specific-functions). |
| `cachePath` | `.dryguard/cache.json` | Persistent incremental index cache; set to `false` to disable. |
| `baselinePath` | `.dryguard/baseline.json` | Accepted-duplicates snapshot; set to `false` to disable baseline lookups entirely. |

## Ignoring specific functions

Two intentionally similar functions that shouldn't be merged (e.g. same
shape, different domain meaning)? Suppress just that one:

```ts
// dryguard-ignore
function calculateShippingTax(amount: number): number {
  // ...
}
```

The marker text is configurable via `ignoreComment` if `dryguard-ignore` collides with something else in your codebase.

## Similarity tiers

- **Structural** (always on): AST-based. Catches renamed/reshaped-but-otherwise-identical functions — `calculateTax(price, rate)` vs `computeTax(amount, percentage)` with the same logic. Very few false positives.
- **Semantic** (opt-in, `semanticTier.enabled` or `--semantic`): a heuristic identifier/call-name bag comparison. Catches functions that do the same thing via a *different* structural shape (a `for` loop vs `.reduce()`), at the cost of more false positives — two functions that happen to call the same three APIs aren't necessarily duplicates. Tune `semanticTier.threshold` up if it's too noisy for your codebase. This is deliberately a cheap, offline heuristic rather than a downloaded embedding model — see the `SemanticScorer` interface in [`packages/core/src/similarity/semantic.ts`](../packages/core/src/similarity/semantic.ts) if you want to plug in a real local embedding model instead.

## Language support

| Language | Adapter | Precision |
|---|---|---|
| TypeScript / JavaScript (`.ts .tsx .js .jsx .mjs .cjs`) | `ts-morph` (`TsAdapter`) | Full — distinguishes parameters from free references. |
| Python (`.py`) | tree-sitter (`TreeSitterAdapter`) | Slightly coarser — see caveat below. |
| Go (`.go`) | tree-sitter (`TreeSitterAdapter`) | Slightly coarser — see caveat below. |

Tree-sitter grammars aren't bundled (they're prebuilt binary `.wasm` files);
fetch them once with network access:

```bash
pnpm add -D tree-sitter-wasms --filter @dryguard/core
node scripts/fetch-grammars.mjs
```

Caveat: the generic tree-sitter adapter folds every identifier to one
`ID_REF` token (it doesn't know "this one is a parameter" without a
per-grammar query file the way the TS adapter does), so it leans a little
more on the semantic tier and on structural shape than the TS/JS path.
Contributions adding a real per-language query file to sharpen this are
welcome — see `packages/core/src/lang/treeSitterAdapter.ts`.

## Performance on large repos

The first index of a large repo is the slow part; every run after that
reuses the persistent cache (`cachePath`, on by default) and only re-parses
files whose content hash actually changed.
