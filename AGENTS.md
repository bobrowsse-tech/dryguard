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
[`docs/HOW_TO_USE.md`](./docs/HOW_TO_USE.md). Treat *this* file as the
current source of truth on what's verified vs. not.

## Known state

- Installed, typechecked, linted, built, and tested (`pnpm lint`,
  `pnpm typecheck`, `pnpm build`, `pnpm test`). Python and Go grammars are
  fetched during `pnpm build` / `pnpm pretest` from `tree-sitter-wasms`
  into `packages/core/grammars/` (those `.wasm` files stay gitignored and
  are copied into the npm package and the VSIX at pack time).
- Public GitHub repo: `bobrowsse-tech/dryguard`. The maintainer login in
  `.github/CODEOWNERS` and `restrict-pr-authors.yml` is `bobrowsse-tech`.
- npm is not logged in on a fresh machine, and the repository secrets
  `NPM_TOKEN`, `VSCE_PAT`, and `OVSX_TOKEN` are still required before
  `release.yml` can publish. `@dryguard/core` is not on npm yet. The VS
  Code publisher id in the extension manifest is `bobrowsse-tech` (already
  created). The Open VSX namespace `bobrowsse-tech` still has to be created
  before the first Open VSX publish.
- The JetBrains plugin (`packages/jetbrains-plugin`) is still a Gradle/Kotlin
  project outside the pnpm workspace. This tree has no Gradle wrapper, so
  `./gradlew` cannot run until a wrapper or a local Gradle install is added.

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

# 4. Python/Go grammars (also run automatically by `pnpm build` and `pnpm pretest`)
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

- **Add repository secrets** before `release.yml` can publish: `NPM_TOKEN` (npm automation token with publish rights for the `@dryguard` scope), `VSCE_PAT` (Azure DevOps PAT with Marketplace → Manage for publisher `bobrowsse-tech`), `OVSX_TOKEN` (Open VSX access token for namespace `bobrowsse-tech`). Without `NPM_TOKEN`, the publish script skips npm and the workflow stays green.
- **Reserve the npm scope and the Open VSX namespace** (`@dryguard` on npm, `bobrowsse-tech` on Open VSX) if not already done — first publish will fail otherwise. The VS Code Marketplace publisher `bobrowsse-tech` already exists. Packages are already at `0.1.0` and have never been published; do not add a changeset just to re-bump that first version.
- **Build and manually test the JetBrains plugin** once Gradle is available (`cd packages/jetbrains-plugin && ./gradlew runIde`). There is no wrapper in the tree yet.
- **Try the extension against a real duplicate** in a non-trivial codebase (not just the fixtures) and tune `threshold`/`semanticTier` in `.dryguardrc.json` if it's too noisy or too lax.
- **Submit the Neovim config to `mason-registry`** (`editors/nvim/mason-registry.json` is a draft) once `@dryguard/lsp-server` is actually published to npm — that registry requires the package to exist first.

## Ground rules for whoever (human or agent) works on this next

- `packages/core` must stay free of MCP-SDK, LSP-library, and editor-plugin dependencies — that separation is the whole point (one detection engine, N thin clients). If you're tempted to import `vscode` or `@modelcontextprotocol/sdk` into `core`, stop and put that code in the consuming package instead.
- Adding a language means adding a `LanguageAdapter` (`packages/core/src/lang/types.ts`), not forking the engine — see `CONTRIBUTING.md#architecture`.
- All changes land via PR per `CONTRIBUTING.md` — don't push directly to `main` even before branch protection is switched on, so the history stays consistent with the policy from day one.
- Run `pnpm changeset` for any user-facing change before opening a PR.
