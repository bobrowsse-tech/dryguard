-- nvim-lspconfig server definition for DryGuard. See README.md in this
-- directory for setup instructions.
return {
  default_config = {
    cmd = { "dryguard-lsp" }, -- resolves via $PATH: `npm i -g @dryguard/lsp-server`, or npx wrapper below
    filetypes = { "typescript", "typescriptreact", "javascript", "javascriptreact", "python", "go" },
    root_dir = function(fname)
      local util = require("lspconfig.util")
      return util.root_pattern(".git", "package.json", "go.mod", "pyproject.toml")(fname)
    end,
    settings = {
      dryguard = {
        threshold = 0.85,
        enable = true,
      },
    },
  },
  docs = {
    description = [[
DryGuard — structural duplicate-code detection.
https://github.com/dryguard-dev/dryguard
]],
  },
}
