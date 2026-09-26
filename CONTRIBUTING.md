# Contributing

DryGuard is open source (MIT) — read the code, fork it, run it, file issues
against it. Contribution of *code* works a little differently than most OSS
projects, on purpose:

## Contribution policy

- **All changes to `main` land only through a pull request** — there is no
  direct push, even for maintainers (branch protection has
  `enforce_admins: true`).
- **Only the project's maintainer(s) can open a pull request against this
  repo.** GitHub doesn't have a native way to restrict PR authorship on a
  public repo, so this is enforced by
  [`.github/workflows/restrict-pr-authors.yml`](./.github/workflows/restrict-pr-authors.yml),
  which auto-closes any PR opened by someone not on the allow-list.
- **If you want to contribute a change:** please open an **issue** first —
  a bug report, a feature request, or a patch described in prose (or linked
  as a diff/gist). A maintainer will implement it, credit you in the
  changelog, and merge it through the normal PR flow above. This keeps a
  single point of review on everything that reaches `main` while still
  taking community input.
- **`main`/`master` cannot be deleted or force-pushed.** Branch protection
  disables both, on top of the PR-only, admin-cannot-bypass rule above.

See [`scripts/setup-branch-protection.sh`](./scripts/setup-branch-protection.sh)
for exactly what's configured and why, line by line.

## Architecture

```
packages/
  core/               structural AST fingerprinting (ts-morph + tree-sitter) + structural/semantic
                       similarity scoring + config/baseline/cache — no I/O beyond reading files
  mcp-server/          @dryguard/core exposed as MCP tools, for AI agents (with a file watcher
                       keeping the index fresh through a long session)
  lsp-server/           @dryguard/core exposed as an LSP (diagnostics + code actions), for editors
  vscode-extension/     thin client: launches lsp-server, adds the vscode.lm-powered "merge" quick fix
  jetbrains-plugin/     thin client: registers lsp-server with the IDE via the LSP4IJ plugin
  cli/                 headless @dryguard/core: `dryguard scan`/`baseline`/`precommit`, for CI and git hooks
editors/
  nvim/                 nvim-lspconfig config + draft mason.nvim registry entry (no plugin needed)
```

`core` has no dependency on the MCP SDK, any LSP library, or a specific
editor's plugin API — that separation is what keeps a single detection
implementation reusable across every IDE and every agent. Within `core`
itself, language-specific parsing is behind the `LanguageAdapter` interface
(`src/lang/`) — TS/JS via `ts-morph` (`TsAdapter`, full precision), anything
else via a single generic tree-sitter adapter (`TreeSitterAdapter`,
per-grammar node-type tables, slightly coarser). If you're adding support
for a new *editor*, you almost certainly want to write a new thin client
against `@dryguard/lsp-server` (most editors speak LSP natively), not touch
`core`. If you're adding support for a new *language*, you want a new
`LanguageAdapter` (most likely another `TreeSitterAdapter` instance plus a
grammar-specific node-type table), not a new engine.

## Local setup

```bash
pnpm install
pnpm build
pnpm test

# Run the VS Code extension in a dev host:
cd packages/vscode-extension && pnpm dev
# then, in VS Code: Run and Debug -> "Launch Extension" (see .vscode/launch.json)
```

## Release process

Releases are automated with [Changesets](https://github.com/changesets/changesets):

1. Land your change via PR (see policy above). Include a changeset:
   `pnpm changeset` — pick the affected package(s) and bump type, describe the change.
2. On merge to `main`, `.github/workflows/release.yml` opens/updates a
   "Version Packages" PR that bumps versions and compiles changelogs from
   pending changesets.
3. Merging the Version Packages PR (itself a normal, reviewed PR) triggers
   the same workflow to publish:
   - `@dryguard/core`, `@dryguard/mcp-server`, `@dryguard/lsp-server`, `@dryguard/cli` → npm
   - `dryguard-vscode` → the VS Code Marketplace **and** Open VSX (so
     VSCodium/Cursor/Windsurf/Gitpod/Theia users get updates too)

The JetBrains plugin (`packages/jetbrains-plugin`) is Gradle/JVM, not pnpm —
it isn't wired into `release.yml` and is published separately (see its own
README) so a TypeScript-only release never depends on having a JVM
toolchain in CI.

Required repository secrets: `NPM_TOKEN`, `VSCE_PAT`, `OVSX_TOKEN`.

## Code style

- TypeScript, strict mode. `pnpm lint` / `pnpm typecheck` must pass.
- One behavior per changeset; write it as "why", changelogs read better that way.
