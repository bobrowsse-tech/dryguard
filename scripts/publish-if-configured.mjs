#!/usr/bin/env node
// Invoked by `pnpm release` from the Changesets GitHub Action.
// Opening the "Version Packages" pull request does not need npm credentials.
// Publishing does. When NPM_TOKEN is absent, exit successfully so the first
// pushes to main stay green until the repository secret is added.
import { spawnSync } from "node:child_process";

const token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
if (!token) {
  console.info(
    "NPM_TOKEN is not set. Skipping npm publish. Add the NPM_TOKEN, VSCE_PAT, and OVSX_TOKEN repository secrets before the first release.",
  );
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "changeset", "publish"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NPM_TOKEN: token,
    NODE_AUTH_TOKEN: token,
    NPM_CONFIG_PROVENANCE: "true",
  },
});

process.exit(result.status ?? 1);
