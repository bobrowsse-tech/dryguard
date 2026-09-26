#!/usr/bin/env node
import { main } from "./server.js";

main().catch((err) => {
  console.error("[dryguard-mcp] fatal error:", err);
  process.exit(1);
});
