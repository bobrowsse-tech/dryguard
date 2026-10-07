# dryguard-vscode

## 0.1.2

### Patch Changes

- a103f8f: The language server must not advertise dryguard.refactorDuplicate, because the VS Code extension already registers it and the double registration aborts client startup.
- Updated dependencies [a103f8f]
  - @dryguard/lsp-server@0.1.2

## 0.1.1

### Patch Changes

- 0a19597: Ship a transparent product icon and a usage guide that says what a duplicate warning looks like, which quick fixes edit code, and which functions DryGuard leaves alone.
- Updated dependencies [0a19597]
  - @dryguard/lsp-server@0.1.1
