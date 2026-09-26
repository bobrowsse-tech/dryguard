import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DryGuardConfig } from "../types.js";

export const CONFIG_FILENAMES = [".dryguardrc.json", ".dryguardrc"];

export const DEFAULT_CONFIG: DryGuardConfig = {
  threshold: 0.85,
  semanticTier: { enabled: false, threshold: 0.7 },
  include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py", "**/*.go"],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/vendor/**",
    "**/.git/**",
    "**/*.d.ts",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*_test.go",
  ],
  ignoreComment: "dryguard-ignore",
  cachePath: ".dryguard/cache.json",
  baselinePath: ".dryguard/baseline.json",
};

/**
 * Loads `.dryguardrc.json` from `rootDir` if present and merges it over
 * `DEFAULT_CONFIG`. A missing file is not an error — DryGuard works with
 * sane defaults out of the box; the config file only overrides them.
 */
export function loadConfig(rootDir: string): DryGuardConfig {
  for (const filename of CONFIG_FILENAMES) {
    const path = join(rootDir, filename);
    if (existsSync(path)) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return mergeConfig(DEFAULT_CONFIG, raw);
      } catch (err) {
        throw new Error(
          `DryGuard: failed to parse ${filename} at ${rootDir}: ${(err as Error).message}`,
        );
      }
    }
  }
  return DEFAULT_CONFIG;
}

function mergeConfig(base: DryGuardConfig, override: Partial<DryGuardConfig>): DryGuardConfig {
  return {
    ...base,
    ...override,
    semanticTier: { ...base.semanticTier, ...override.semanticTier },
  };
}

/** Writes a starter `.dryguardrc.json` next to the given root, if one doesn't already exist. */
export function configTemplate(): string {
  return `${JSON.stringify(
    {
      threshold: DEFAULT_CONFIG.threshold,
      semanticTier: DEFAULT_CONFIG.semanticTier,
      exclude: DEFAULT_CONFIG.exclude,
      ignoreComment: DEFAULT_CONFIG.ignoreComment,
      cachePath: DEFAULT_CONFIG.cachePath,
      baselinePath: DEFAULT_CONFIG.baselinePath,
    },
    null,
    2,
  )}\n`;
}
