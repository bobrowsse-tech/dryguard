import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const coreRequire = createRequire(join(here, "../core/package.json"));

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: !watch,
  external: ["vscode"],
};

/** @type {esbuild.BuildOptions} */
const client = {
  ...shared,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  format: "cjs",
};

// The language server is shipped inside the VSIX and spawned by the extension
// host. Bundling it avoids publishing pnpm workspace dependencies.
/** @type {esbuild.BuildOptions} */
const server = {
  ...shared,
  entryPoints: ["../lsp-server/src/cli.ts"],
  outfile: "dist/server.mjs",
  format: "esm",
  banner: {
    js: [
      "import { createRequire } from 'node:module';",
      "import { dirname } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "const require = createRequire(import.meta.url);",
      "const __filename = fileURLToPath(import.meta.url);",
      "const __dirname = dirname(__filename);",
    ].join("\n"),
  },
};

function copyServerAssets() {
  copyFileSync(coreRequire.resolve("web-tree-sitter/tree-sitter.wasm"), join(here, "dist/tree-sitter.wasm"));
  const grammarsDir = join(here, "dist/grammars");
  mkdirSync(grammarsDir, { recursive: true });
  for (const name of ["python.wasm", "go.wasm"]) {
    copyFileSync(join(here, "../core/grammars", name), join(grammarsDir, name));
  }
}

if (watch) {
  const clientCtx = await esbuild.context(client);
  const serverCtx = await esbuild.context(server);
  await Promise.all([clientCtx.watch(), serverCtx.watch()]);
  copyServerAssets();
  console.log("watching for changes...");
} else {
  await Promise.all([esbuild.build(client), esbuild.build(server)]);
  copyServerAssets();
}
