# Agent directive — building DryGuard

This file is for an AI coding agent (Claude Code, Cursor, Copilot, etc.)
picking this repo up on a fresh machine, most likely a MacBook, where none
of this has been installed or built yet. Read this before touching anything.

## What this repo is

A pnpm workspace monorepo built around one detection engine
(`@dryguard/core`), consumed by an MCP server, an LSP server, a VS Code
extension, a JetBrains plugin scaffold, and a headless CLI — plus Neovim
config under `editors/nvim`. Full architecture:
[`CONTRIBUTING.md`](./CONTRIBUTING.md#architecture). Full concept/design
rationale and per-surface usage: [`README.md`](./README.md) and
[`docs/HOW_TO_USE.md`](./docs/HOW_TO_USE.md).

## Known state as of this handoff

- Code is fully scaffolded and committed to git (`main` branch).
- **Nothing has been installed, built, or tested yet.** The sandbox this was
  written in had no network access to `registry.npmjs.org` (org policy
  blocked it, confirmed via direct `curl` → `403 Host not in allowlist`), so
  `pnpm install`, `pnpm build`, and `pnpm test` have never actually been run
  against this code. Treat every package as "should work" rather than
  "verified" until you've run the steps below and they pass.
- No GitHub remote is configured (`git remote -v` is empty). No repo has
  been created on GitHub yet either.
- The Python/Go tree-sitter adapters (`packages/core/src/lang/treeSitterAdapter.ts`)
  need grammar `.wasm` files that were never fetched here (also a network
  dependency) — see step 4 below. Until fetched, `.py`/`.go` indexing will
  throw a clear "missing grammar" error rather than silently doing nothing;
  TS/JS is unaffected.
- The JetBrains plugin (`packages/jetbrains-plugin`) is a Gradle/Kotlin
  project, outside the pnpm workspace and never built (`./gradlew` has
  never run here) — see its own README.

## First-time setup on macOS

```bash
# 1. Toolchain (skip whatever you already have)
brew install node@22       # or nvm install 22 && nvm use 22
corepack enable             # ships with modern Node; enables pnpm via packageManager field
corepack prepare pnpm@10.28.0 --activate

# 2. Install
cd dryguard
pnpm install

# 3. Verify, in this order — each step assumes the previous one passed
pnpm typecheck   # tsc -b across all packages, via project references
pnpm lint
pnpm build       # compiles core -> mcp-server/lsp-server/cli (which depend on it) -> vscode-extension bundles with esbuild
pnpm test        # vitest; packages/core has the only tests so far — extend this

# 4. Optional: Python/Go support (needs network; skip to keep TS/JS-only for now)
pnpm add -D tree-sitter-wasms --filter @dryguard/core
node scripts/fetch-grammars.mjs
```

If `pnpm typecheck` or `pnpm build` fail: this is the *first* real compile of
this code, so treat failures as genuine bugs to fix, not environment issues
— read the error, fix the source, don't work around the type system.
`packages/core/src/index/workspaceIndex.test.ts` and the other `*.test.ts`
files under `packages/core/src` are the reference for expected behavior (a
renamed duplicate function should score ≥0.85; an unrelated function should
not match; a `// dryguard-ignore`-marked function should never match; a
config file's values should override defaults).

## Running / debugging each package

- **`@dryguard/core`**: `pnpm --filter @dryguard/core test` — no runtime to launch, it's a library.
- **`@dryguard/mcp-server`**: `pnpm --filter @dryguard/mcp-server build && node packages/mcp-server/dist/cli.js` talks MCP over stdio. Wire it into Claude Code / Cursor's MCP config pointing at that `dist/cli.js`, or `npx @dryguard/mcp-server` once published (see README's "Using it" section).
- **`@dryguard/lsp-server`**: not meant to be run standalone by a human — it's launched by an LSP client. Test it via the VS Code extension below, or point another editor's LSP client config at `node packages/lsp-server/dist/cli.js`.
- **`dryguard-vscode`**: open this repo's root in VS Code, run `pnpm --filter @dryguard/core --filter @dryguard/lsp-server --filter dryguard-vscode build` (or use the `.vscode/tasks.json` task, wired to the `Launch Extension` debug config in `.vscode/launch.json`), then `F5` to open an Extension Development Host. Open a `.ts` file with an obvious duplicate function in the dev host to see the diagnostic.
- **`@dryguard/cli`**: `pnpm --filter @dryguard/cli build && node packages/cli/dist/cli.js scan .` (or `init` / `baseline` / `precommit`).
- **JetBrains plugin**: separate toolchain, see `packages/jetbrains-plugin/README.md` — requires a JDK and Gradle, not part of `pnpm build`.
- **Neovim**: no build step — `editors/nvim/README.md` is copy-paste config.

## Things intentionally left for you to finish

- **Push to GitHub.** No remote exists yet. Create `dryguard-dev/dryguard` (or wherever the user wants it) as a **public** repo, `git remote add origin <url>`, push `main`. Confirm with the user before creating anything under an org rather than their personal account.
- **Run `scripts/setup-branch-protection.sh <owner>/<repo> <maintainer-github-login>`** immediately after the first push, before advertising the repo anywhere. It requires `gh auth login` first. This is what makes `main` PR-only, un-deletable, and admin-can't-bypass, and closes the loop with `.github/workflows/restrict-pr-authors.yml` (update the `ALLOWED_AUTHORS` env var in that workflow and `.github/CODEOWNERS`'s `@bobrowsse` line if the maintainer's GitHub login differs).
- **Add repository secrets** before the `release.yml` workflow can actually publish anything: `NPM_TOKEN` (npm automation token with publish rights for the `@dryguard` scope), `VSCE_PAT` (Azure DevOps PAT for the VS Code Marketplace publisher `dryguard-dev`), `OVSX_TOKEN` (Open VSX access token, same publisher namespace).
- **Reserve the npm scope and marketplace publisher name** (`@dryguard` on npm, `dryguard-dev` on VS Code Marketplace / Open VSX) if not already done — first publish will fail otherwise.
- **Expand test coverage.** `mcp-server`, `lsp-server`, `cli`, and the tree-sitter adapter have no tests yet — `packages/core`'s AST/config/baseline/semantic paths do. Add at least one integration test per package before the first real release.
- **Fetch tree-sitter grammars and validate Python/Go detection** against real code, per step 4 above — this has never been exercised end-to-end.
- **Build and manually test the JetBrains plugin** (`cd packages/jetbrains-plugin && ./gradlew runIde`) — this Kotlin has never compiled.
- **Try the extension against a real duplicate** in a non-trivial codebase (not just the toy fixtures) and tune `threshold`/`semanticTier` in `.dryguardrc.json` if it's too noisy or too lax.
- **Submit the Neovim config to `mason-registry`** (`editors/nvim/mason-registry.json` is a draft) once `@dryguard/lsp-server` is actually published to npm — that registry requires the package to exist first.

## Ground rules for whoever (human or agent) works on this next

- `packages/core` must stay free of MCP-SDK, LSP-library, and editor-plugin dependencies — that separation is the whole point (one detection engine, N thin clients). If you're tempted to import `vscode` or `@modelcontextprotocol/sdk` into `core`, stop and put that code in the consuming package instead.
- Adding a language means adding a `LanguageAdapter` (`packages/core/src/lang/types.ts`), not forking the engine — see `CONTRIBUTING.md#architecture`.
- All changes land via PR per `CONTRIBUTING.md` — don't push directly to `main` even before branch protection is switched on, so the history stays consistent with the policy from day one.
- Run `pnpm changeset` for any user-facing change before opening a PR.
