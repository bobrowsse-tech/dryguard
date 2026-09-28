# @dryguard/mcp-server

<p align="center">
  <img src="https://github.com/bobrowsse-tech/dryguard/raw/main/packages/vscode-extension/images/icon.png" width="96" alt="DryGuard">
</p>

MCP server that lets an AI coding agent check a proposed function against the workspace **before** writing it.

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

## Tools

| Tool | Call it when | What comes back |
|---|---|---|
| `index_workspace` | Once per session, with the project root. `watch` defaults to true, so later edits refresh the index. | The set of functions DryGuard will compare against. |
| `check_similarity` | Before writing a new function. Pass the proposed source. | `isDuplicate` plus the best existing match and its score. |
| `get_refactor_suggestion` | After `isDuplicate` is true. | The existing function's source and a suggestion: `reuse-directly` or `extract-shared-helper`. |

`isDuplicate: true` means the proposal scores at or above the structural threshold (default **0.85**) against a function already in the index. The server does not edit files. The agent should reuse the match instead of writing the copy.

Pass `semantic: true` on `check_similarity` to also run the looser identifier/API tier. That tier is off by default because two functions that call the same few APIs are not always duplicates.

Functions with fewer than three statements and no branch or loop are not indexed. A `dryguard-ignore` comment above a function, and pairs recorded in `.dryguard/baseline.json`, are not reported.

Editor warnings, CI, and the rest of the configuration are in [How to use DryGuard](https://github.com/bobrowsse-tech/dryguard/blob/main/docs/HOW_TO_USE.md).
