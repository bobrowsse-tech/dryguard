import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("returns defaults when no .dryguardrc.json is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "dryguard-config-"));
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });

  it("merges a partial .dryguardrc.json over the defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "dryguard-config-"));
    writeFileSync(
      join(dir, ".dryguardrc.json"),
      JSON.stringify({ threshold: 0.9, semanticTier: { enabled: true } }),
      "utf8",
    );
    const config = loadConfig(dir);
    expect(config.threshold).toBe(0.9);
    expect(config.semanticTier).toEqual({ enabled: true, threshold: DEFAULT_CONFIG.semanticTier.threshold });
    expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude); // untouched keys keep their default
  });
});
