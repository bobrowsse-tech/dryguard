# DryGuard for JetBrains IDEs

A thin plugin that registers `@dryguard/lsp-server` with
[LSP4IJ](https://github.com/redhat-developer/lsp4ij), the same way the VS
Code extension registers it with `vscode-languageclient` — no separate
detection logic lives here.

## Status

**Scaffolded, not built or published.** This is a real Gradle/Kotlin/
IntelliJ Platform Plugin project structure, but it was written in an
environment without JVM package registry access, so `./gradlew build` has
never been run against it. Treat it the same as the rest of this repo per
`AGENTS.md`: verify before trusting.

## Prerequisites

- JetBrains [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) plugin installed in the target IDE.
- `@dryguard/lsp-server` built (`pnpm --filter @dryguard/lsp-server build`) before `./gradlew build` here, so `processResources` can bundle its `dist/` output.
- Node.js on PATH inside the IDE's environment (or a `dryguard-lsp` global install as the fallback path in `DryGuardLanguageServerFactory.kt`).

## Build & run

```bash
cd packages/jetbrains-plugin
./gradlew buildPlugin   # produces build/distributions/dryguard-jetbrains-*.zip
./gradlew runIde        # launches a sandboxed IDE instance with the plugin loaded, for manual testing
```

## Publishing

Same shape as the VS Code release: reserve `dev.dryguard.jetbrains` on the
[JetBrains Marketplace](https://plugins.jetbrains.com/), add a
`JETBRAINS_MARKETPLACE_TOKEN` secret, and add a `publishPlugin` Gradle IntelliJ
Platform task invocation to a new `.github/workflows/release-jetbrains.yml` —
intentionally not wired into the main `release.yml` yet, since it has an
entirely separate toolchain (Gradle/JVM) from the rest of this pnpm
workspace and shouldn't block a TypeScript-only release.
