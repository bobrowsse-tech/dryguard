---
"@dryguard/lsp-server": patch
"dryguard-vscode": patch
---

The language server must not advertise dryguard.refactorDuplicate, because the VS Code extension already registers it and the double registration aborts client startup.
