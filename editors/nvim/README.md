# DryGuard in Neovim

DryGuard doesn't need a Neovim-specific plugin — it's a standard language
server, so `nvim-lspconfig` can launch it directly. This directory just
packages the config so it's a copy-paste (or `mason.nvim` registry) away
instead of something you have to write yourself.

## Quick setup (nvim-lspconfig, no mason)

```lua
-- after nvim-lspconfig is loaded
require("lspconfig.configs").dryguard = require("dryguard-lspconfig")
require("lspconfig").dryguard.setup({
  -- optional overrides, e.g.:
  -- settings = { dryguard = { threshold = 0.8 } },
})
```

`dryguard-lspconfig.lua` in this directory is the config module referenced
above — put it on your `runtimepath` (e.g. `~/.config/nvim/lua/dryguard-lspconfig.lua`)
or `require` it via a relative path if you vendor this repo.

## With lazy.nvim

```lua
{
  "neovim/nvim-lspconfig",
  dependencies = { "williamboman/mason.nvim", "williamboman/mason-lspconfig.nvim" },
  config = function()
    require("lspconfig.configs").dryguard = require("dryguard-lspconfig")
    require("lspconfig").dryguard.setup({})
  end,
}
```

## With mason.nvim (once published)

`mason-registry.json` in this directory is a draft entry for submission to
[`mason-registry`](https://github.com/mason-org/mason-registry) once
`@dryguard/lsp-server` is published to npm — that registry requires the
package to actually exist on npm first, so this is left as a draft (not yet
submitted) per the honesty note in `AGENTS.md`. Once submitted and merged,
setup becomes:

```lua
require("mason").setup()
require("mason-lspconfig").setup({ ensure_installed = { "dryguard" } })
```

## Requires

Node.js on `$PATH` (the language server is a Node binary, same as every
other editor integration in this repo).
