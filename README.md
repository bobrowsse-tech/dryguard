# DryGuard

DryGuard stops AI coding agents (and humans) from writing duplicate code. It
parses new functions into a structural AST fingerprint, compares them against
everything already in your workspace, and blocks the duplicate before it ever
lands — as an editor diagnostic, and as an MCP tool an agent can call before
it writes a single line.

```
"DRY violation: this looks 92% structurally identical to `calculateTax`
in src/billing.ts:14. Reuse or extract a shared helper instead of
duplicating it."
```

## Why

Agentic coding tools default to regenerating logic that already exists in
your codebase rather than doing the harder work of finding and reusing it.
DryGuard makes that impossible to ignore, for both agents and people.

## How it works

One similarity engine, three surfaces:

| Package | What it is | Who uses it |
|---|---|---|
| [`@dryguard/core`](./packages/core) | AST fingerprinting + structural similarity scoring | the other two packages |
| [`@dryguard/mcp-server`](./packages/mcp-server) | An MCP server exposing `index_workspace`, `check_similarity`, `get_refactor_suggestion` | AI agents — Claude Code, Cursor, Copilot Workspace, Roo Code, or anything else that speaks MCP |
| [`@dryguard/lsp-server`](./packages/lsp-server) | A standard Language Server (diagnostics + code actions) | every LSP-capable editor — VS Code, Neovim, Helix, Sublime, Emacs, JetBrains via [LSP4IJ](https://github.com/redhat-developer/vscode-java) |
| [`dryguard-vscode`](./packages/vscode-extension) | Thin VS Code client that launches the LSP server and wires up an AI-assisted "merge this duplicate" quick fix using `vscode.lm` | VS Code / Cursor / Windsurf users |

Because the detection logic lives once in `@dryguard/core` and is reused by
both the MCP server and the LSP server, DryGuard works the same way whether
it's an agent calling a tool or a human seeing a squiggly line — and adding
a new IDE only means writing a thin LSP client, not re-implementing detection.

## Using it

### As an AI agent (MCP)

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

Then, at the start of a session: call `index_workspace` with the project
root once, and `check_similarity` before writing any new function.

### As a human, in VS Code

Install "DryGuard" from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=dryguard-dev.dryguard-vscode)
or [Open VSX](https://open-vsx.org/extension/dryguard-dev/dryguard-vscode) (for
VSCodium, Cursor, Windsurf, Gitpod, Theia, ...). It activates automatically
for JS/TS projects.

### In any other LSP-capable editor

Run `npx @dryguard/lsp-server` as the language server command for
JS/TS files. See your editor's docs for how to register a custom language
server (Neovim: `nvim-lspconfig`; JetBrains: the LSP4IJ plugin; Helix:
`languages.toml`).

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `dryguard.enable` | `true` | Turn diagnostics on/off |
| `dryguard.threshold` | `0.85` | Structural similarity score (0–1) required to flag a duplicate |

## Development

This is a pnpm workspace monorepo.

```bash
pnpm install
pnpm build
pnpm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the architecture in more depth,
the release process, and this repo's (deliberately strict) contribution
policy.

## License

[MIT](./LICENSE)
