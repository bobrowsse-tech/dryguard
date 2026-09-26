# DryGuard — Architecture & Repo Setup (project status snapshot)

> This is the running status/decision-log doc that was kept alongside this
> repo in the Claude project workspace during scaffolding. It's included
> here so an agent picking up the repo cold has the same context without
> needing access to that project. For living, maintained docs, prefer
> `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, and `docs/HOW_TO_USE.md` —
> this file is a point-in-time snapshot, not something to keep updated.

DryGuard is a DRY-enforcement tool that works as an **MCP server** (for AI coding agents), a **Language Server** (for every LSP-capable IDE), and a **headless CLI** (for CI/pre-commit) — all built from one shared detection engine.

## Monorepo layout (pnpm workspaces)

```
packages/
  core/               @dryguard/core — the shared engine:
                       - AST structural fingerprinting behind a LanguageAdapter interface
                         (src/lang/): TsAdapter (ts-morph, full precision) for TS/JS,
                         TreeSitterAdapter (generic, per-grammar node-type tables) for
                         Python/Go.
                       - Structural similarity: Jaccard over normalized-token shingles.
                       - Semantic similarity (opt-in): cosine similarity over an
                         identifier/call-name frequency bag (src/similarity/semantic.ts) —
                         a cheap offline heuristic, not a downloaded embedding model;
                         SemanticScorer interface is the swap-in point for a real one later.
                       - Config (.dryguardrc.json loader), baseline (accepted-duplicates
                         snapshot for adopting DryGuard on existing code), persistent
                         content-hash-keyed cache, // dryguard-ignore suppression.
                       No dependency on MCP/LSP/editor libs — reusable by everything below.
  mcp-server/         @dryguard/mcp-server — MCP tools: index_workspace (now starts a
                       chokidar file watcher by default so a long agent session doesn't
                       need manual re-indexing), check_similarity, get_refactor_suggestion.
  lsp-server/         @dryguard/lsp-server — standard Language Server: diagnostics + two
                       code actions (navigate to match, AI-assisted merge). One
                       implementation for VS Code, Neovim, JetBrains (via LSP4IJ),
                       Sublime, Helix, Emacs.
  vscode-extension/   dryguard-vscode — thin client: launches lsp-server, implements the
                       AI-assisted merge via vscode.lm (no separate API key) + WorkspaceEdit.
  jetbrains-plugin/   Gradle/Kotlin scaffold registering lsp-server via the LSP4IJ plugin —
                       same thin-client pattern as VS Code. Separate toolchain, not part of
                       pnpm build; not wired into release.yml.
  cli/                @dryguard/cli — `dryguard scan` (CI duplication gate; text/json/
                       markdown output), `dryguard baseline`, `dryguard precommit`
                       (scoped to staged/changed files), `dryguard init`.
editors/nvim/         nvim-lspconfig config (no plugin needed) + a draft mason-registry
                       entry (not yet submitted upstream — needs the npm package published
                       first).
```

## Detection approach

- Extracts every function/method (TS/JS via `ts-morph`; Python/Go via a generic tree-sitter adapter) big enough to matter, skipping anything preceded by a `// dryguard-ignore` comment.
- Normalizes each into a token stream: identifiers folded to `ID_LOCAL`/`ID_REF` (TS/JS only distinguishes params from free refs; tree-sitter folds all to `ID_REF`), literals folded to `LIT_STRING`/`LIT_NUMBER`/`LIT_BOOL`, structural nodes (if/for/while/switch/try/binary-expr/call/etc.) kept as their node-type name.
- **Structural tier** (always on): 5-token shingles over that stream, Jaccard similarity, default threshold 0.85. A cheap signature (param count, token count, branch count) pre-filters unrelated pairs first.
- **Semantic tier** (opt-in, `semanticTier.enabled` / `--semantic`): cosine similarity over the *un-folded* identifier/call-name bag captured in the same traversal — catches same-behavior-different-shape duplicates (a `for` loop vs `.reduce()`) that share no structural tokens.
- **Baseline**: a snapshot (`.dryguard/baseline.json`) of pair-ids accepted at `dryguard baseline` time; both tiers skip anything in it, so adopting DryGuard on a large existing codebase doesn't fail on day one.
- **Cache**: `.dryguard/cache.json`, keyed by each file's content hash — unchanged files are loaded from cache instead of re-parsed on every index build.

## Distribution / release

- **Changesets**-based versioning for the pnpm side. `pnpm changeset` on each PR; merging to `main` opens a "Version Packages" PR; merging *that* PR publishes.
- Publishes `@dryguard/core`, `@dryguard/mcp-server`, `@dryguard/lsp-server`, `@dryguard/cli` to **npm**, and `dryguard-vscode` to both the **VS Code Marketplace** and **Open VSX**.
- The JetBrains plugin is published separately (its own README) since it's Gradle/JVM, not pnpm.
- GitHub Actions: `ci.yml` (build/lint/typecheck/test on Node 18/20/22, VSIX packaging smoke test, a `dryguard scan` dogfood smoke test), `release.yml` (changesets action), `pr-title-lint.yml`, `restrict-pr-authors.yml`.

## Repo governance (open source, but locked down)

- `main` is protected: no deletion, no force-push, `enforce_admins: true`, required PR review + green CI.
- GitHub has no native "who can open a PR" toggle for public repos — `.github/workflows/restrict-pr-authors.yml` auto-closes any PR not opened by an allow-listed maintainer login.
- `scripts/setup-branch-protection.sh <owner>/<repo> [maintainer-login ...]` configures all of the above via `gh api`, run once against the real GitHub repo after creation.

## Adoption path for a new user (docs/HOW_TO_USE.md has the full version)

1. MCP config for an agent, or install the VS Code/JetBrains/Neovim integration.
2. `npx @dryguard/cli init` → `.dryguardrc.json`.
3. `npx @dryguard/cli baseline .` once, if adopting on an existing codebase.
4. `npx @dryguard/cli scan .` in CI, and/or the pre-commit hook (`.pre-commit-hooks.yaml` or `scripts/install-git-hook.sh`).

## Status as of 2026-09-26

Two commits on `main`: the initial scaffold, then a second pass adding the full nice-to-have list (config/baseline/ignore-comments, semantic tier, multi-language via tree-sitter, the CLI package, MCP file-watcher, JetBrains scaffold, Neovim packaging) plus `docs/HOW_TO_USE.md` and a rewritten README.

**Not yet done — see `AGENTS.md` for the authoritative, maintained version of this list:**
- **Not yet pushed to GitHub** — no GitHub account was linked in the Claude session that scaffolded this; push has to happen from wherever you're reading this.
- **Nothing has been installed/built/tested** — the scaffolding sandbox had no npm registry access at all (confirmed via direct `curl` → `403 Host not in allowlist`). Every package should be treated as "should work" rather than "verified" until `pnpm install && pnpm build && pnpm test` actually pass.
- Tree-sitter Python/Go grammars were never fetched (also needs network) — `scripts/fetch-grammars.mjs` is written but never run.
- The JetBrains plugin's Kotlin has never compiled (`./gradlew` never run).
- The core tests exist but have never actually executed.
