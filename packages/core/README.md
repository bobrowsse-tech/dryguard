# @dryguard/core

<p align="center">
  <img src="https://github.com/bobrowsse-tech/dryguard/raw/main/packages/vscode-extension/images/icon.png" width="96" alt="DryGuard">
</p>

Structural duplicate-code detection: AST fingerprints, structural and semantic similarity, config, baselines, and the incremental cache.

This package is the engine. It does not start a server or print a report. Call it from `@dryguard/mcp-server`, `@dryguard/lsp-server`, or `@dryguard/cli`, or import `WorkspaceIndex` if you are building another client.

## What a match means

A candidate is a function or method with at least three statements, or with a branch or loop. DryGuard scores it against functions already indexed in the workspace.

- **Structural score** (always on): same shape after names are normalized. A renamed copy of `calculateTax` still scores high. The default line is `0.85`.
- **Semantic score** (off unless you enable `semanticTier`): overlapping identifiers and call names, so a `for` loop and a `.reduce()` that do the same job can match. It is noisier. Default line `0.7`.

Anything marked with the ignore comment (`dryguard-ignore` by default) is left out of the index. A baseline file lists duplicates the team has already accepted; those pairs are not reported again.

TypeScript and JavaScript are parsed with `ts-morph`. Python and Go use the tree-sitter grammars shipped in this package's `grammars/` directory. Python and Go fingerprints treat identifiers more coarsely than the TypeScript path.

## Configuration

Every client reads `.dryguardrc.json` from the workspace root. `npx @dryguard/cli init` writes a starter. The fields are `threshold`, `semanticTier`, `include`, `exclude`, `ignoreComment`, `cachePath`, and `baselinePath`.

Full usage, including what each client shows when a duplicate is found: [How to use DryGuard](https://github.com/bobrowsse-tech/dryguard/blob/main/docs/HOW_TO_USE.md).
