Tree-sitter grammar `.wasm` files (`python.wasm`, `go.wasm`, ...) go here.
They're fetched by `node scripts/fetch-grammars.mjs` (see the root
`AGENTS.md`) and are gitignored — regenerate them locally rather than
committing binaries, unless you'd rather commit them for reproducibility,
in which case remove the `*.wasm` line for this directory from `.gitignore`.
