# DryGuard

[![CI](https://github.com/bobrowsse-tech/dryguard/actions/workflows/ci.yml/badge.svg)](https://github.com/bobrowsse-tech/dryguard/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40dryguard%2Fcore)](https://www.npmjs.com/package/@dryguard/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

DryGuard stops AI coding agents (and humans) from writing duplicate code. It
parses new functions into a structural AST fingerprint, compares them against
everything already in your workspace, and blocks the duplicate before it ever
lands — as an editor diagnostic, as an MCP tool an agent can call before it
writes a single line, and as a CI gate.

```
DRY violation: this looks 92% structurally identical to `calculateTax`
in src/billing.ts:14. Reuse or extract a shared helper instead of
duplicating it.
```

**📖 [Full usage guide](./docs/HOW_TO_USE.md)** — configuration, CI, pre-commit hooks, adopting it on an existing codebase, per-editor setup.

## Why

Agentic coding tools default to regenerating logic that already exists in
your codebase rather than doing the harder work of finding and reusing it.
DryGuard makes that impossible to ignore, for both agents and people —
before the code is written, not after, in a lint pass nobody reads.

## How it works

One similarity engine, reused across every surface, so adding a new IDE
never means re-implementing detection:

| Package | What it is | Who uses it |
|---|---|---|
| [`@dryguard/core`](./packages/core) | AST fingerprinting (TS/JS via `ts-morph`, Python/Go via tree-sitter) + structural & semantic similarity scoring, config, caching, baselines | the packages below |
| [`@dryguard/mcp-server`](./packages/mcp-server) | MCP server: `index_workspace` (with an auto-refreshing file watcher), `check_similarity`, `get_refactor_suggestion` | AI agents — Claude Code, Cursor, Copilot Workspace, Roo Code, or anything else that speaks MCP |
| [`@dryguard/lsp-server`](./packages/lsp-server) | A standard Language Server (diagnostics + code actions) | every LSP-capable editor — VS Code, Neovim, Sublime, Helix, Emacs, JetBrains via [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) |
| [`dryguard-vscode`](./packages/vscode-extension) | Thin VS Code client: launches the LSP server, adds an AI-assisted "merge this duplicate" quick fix using `vscode.lm` | VS Code / Cursor / Windsurf users |
| [`packages/jetbrains-plugin`](./packages/jetbrains-plugin) | Thin JetBrains plugin registering `@dryguard/lsp-server` via LSP4IJ | IntelliJ IDEA, PyCharm, GoLand, WebStorm, ... |
| [`@dryguard/cli`](./packages/cli) | Headless `dryguard scan` / `dryguard baseline` / `dryguard precommit` | CI pipelines, pre-commit hooks |
| [`editors/nvim`](./editors/nvim) | `nvim-lspconfig` config + draft `mason.nvim` registry entry | Neovim users |

## Quick start

```bash
# AI agent (MCP) — see docs/HOW_TO_USE.md for the config snippet
npx -y @dryguard/mcp-server

# VS Code — install "DryGuard" from the Marketplace or Open VSX

# CI / pre-commit
npx @dryguard/cli scan .
npx @dryguard/cli baseline .   # first run on an existing codebase — see docs
```

See **[docs/HOW_TO_USE.md](./docs/HOW_TO_USE.md)** for the rest: configuration
(`.dryguardrc.json`), the semantic similarity tier, `// dryguard-ignore`,
pre-commit hooks, and per-editor setup for Neovim/JetBrains/others.

## Nice-to-haves already built in

- **Baseline/allowlist** — adopt DryGuard on a large existing codebase without drowning in pre-existing duplicates; only new duplication is flagged.
- **Inline suppression** (`// dryguard-ignore`) for deliberate, accepted look-alikes.
- **Opt-in semantic tier** — catches functions that do the same thing via a different structural shape (heuristic identifier/API overlap, no model download required).
- **Multi-language**: TypeScript/JavaScript (full precision), Python and Go (via tree-sitter).
- **Headless CLI** (`dryguard scan`) for CI duplication gating, independent of any IDE.
- **Persistent incremental cache** — re-indexing a large repo only re-parses what changed.
- **Pre-commit hook** (both the `pre-commit` framework and a plain git-hook script).
- **JetBrains plugin scaffold** and **Neovim (`nvim-lspconfig`) packaging**.
- **Auto-refreshing MCP index** — a file watcher keeps the index current through a long agent session without manual re-indexing.

## Configuration

See the full table in [docs/HOW_TO_USE.md#configuration](./docs/HOW_TO_USE.md#configuration). The essentials:

| Setting | Default | Meaning |
|---|---|---|
| `dryguard.enable` (editor) / `enable` | `true` | Turn diagnostics on/off |
| `dryguard.threshold` / `threshold` | `0.85` | Structural similarity score (0–1) required to flag a duplicate |
| `semanticTier.enabled` | `false` | Also run the looser semantic tier |

## Development

This is a pnpm workspace monorepo. See **[AGENTS.md](./AGENTS.md)** for full
setup/build instructions (written for whoever — human or agent — picks this
up on a fresh machine) and **[CONTRIBUTING.md](./CONTRIBUTING.md)** for
architecture details and this repo's contribution policy.

```bash
pnpm install
pnpm build
pnpm test
```

## License

[MIT](./LICENSE)
