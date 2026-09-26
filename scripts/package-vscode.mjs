#!/usr/bin/env node
// Builds a self-contained VSIX. The language server is bundled into
// dist/server.mjs, so the package does not need pnpm workspace dependencies
// installed inside it.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(root, "packages", "vscode-extension");
const vsixPath = join(extensionDir, "dryguard.vsix");
const vsceBin = join(extensionDir, "node_modules", ".bin", "vsce");

execFileSync(
  "pnpm",
  ["--filter", "@dryguard/core", "--filter", "@dryguard/lsp-server", "--filter", "dryguard-vscode", "build"],
  { cwd: root, stdio: "inherit" },
);

execFileSync(vsceBin, ["package", "--no-dependencies", "--skip-license", "-o", vsixPath], {
  cwd: extensionDir,
  stdio: "inherit",
});
