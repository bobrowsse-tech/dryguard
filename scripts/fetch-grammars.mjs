#!/usr/bin/env node
// Copies prebuilt tree-sitter grammar .wasm files (from the `tree-sitter-wasms`
// npm package) into packages/core/grammars/, where TreeSitterAdapter expects
// to find them. Run this once, whenever you have npm registry access — the
// sandbox this repo was scaffolded in did not, so it's never been run here.
//
// Usage: node scripts/fetch-grammars.mjs
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "packages", "core", "grammars");
mkdirSync(outDir, { recursive: true });

const GRAMMARS = {
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
};

let pkgDir;
try {
  pkgDir = dirname(
    fileURLToPath(await import.meta.resolve("tree-sitter-wasms/package.json")),
  );
} catch {
  console.error(
    "tree-sitter-wasms isn't installed. Add it first:\n" +
      "  pnpm add -D tree-sitter-wasms --filter @dryguard/core\n" +
      "then re-run this script.",
  );
  process.exit(1);
}

for (const [lang, filename] of Object.entries(GRAMMARS)) {
  const src = join(pkgDir, "out", filename);
  const dest = join(outDir, `${lang}.wasm`);
  if (!existsSync(src)) {
    console.warn(`skip ${lang}: ${src} not found in tree-sitter-wasms`);
    continue;
  }
  copyFileSync(src, dest);
  console.log(`wrote ${dest}`);
}

console.log("Done. TreeSitterAdapter will now pick these up automatically.");
