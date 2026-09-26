# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish packages.

- Run `pnpm changeset` after any user-facing change and describe it — this creates a markdown file in `.changeset/` that you commit alongside your code, as part of your PR.
- On merge to `main`, the `release` workflow opens (or updates) a "Version Packages" PR that bumps versions and rewrites changelogs from the accumulated changesets.
- Merging *that* PR (still via a reviewed PR, per branch protection) triggers the actual publish to npm, the VS Code Marketplace, and Open VSX.

See `CONTRIBUTING.md` for the full release flow.
