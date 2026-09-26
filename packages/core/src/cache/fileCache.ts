import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CodeUnit } from "../types.js";

export function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

interface SerializedUnit extends Omit<CodeUnit, "shingles" | "identifierBag"> {
  shingles: string[];
  identifierBag: [string, number][];
}

interface CacheFile {
  version: 1;
  /** filePath -> { hash, units } */
  files: Record<string, { hash: string; units: SerializedUnit[] }>;
}

/**
 * Persists indexed units to disk, keyed by each source file's content hash,
 * so `WorkspaceIndex.build` can skip re-parsing (and, for TS, re-typechecking
 * via ts-morph) any file that hasn't changed since the last run. This is
 * what keeps cold-start indexing of a large repo fast on every new agent
 * session or editor restart.
 */
export class FileCache {
  private files = new Map<string, { hash: string; units: CodeUnit[] }>();
  private dirty = false;

  static load(path: string): FileCache {
    const cache = new FileCache();
    if (existsSync(path)) {
      try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
        for (const [filePath, entry] of Object.entries(parsed.files)) {
          cache.files.set(filePath, {
            hash: entry.hash,
            units: entry.units.map(deserializeUnit),
          });
        }
      } catch {
        // Corrupt or incompatible cache — start fresh rather than failing the whole index.
      }
    }
    return cache;
  }

  /** Returns cached units for `filePath` if its hash still matches `currentHash`. */
  get(filePath: string, currentHash: string): CodeUnit[] | undefined {
    const entry = this.files.get(filePath);
    if (entry && entry.hash === currentHash) return entry.units;
    return undefined;
  }

  set(filePath: string, hash: string, units: CodeUnit[]): void {
    this.files.set(filePath, { hash, units });
    this.dirty = true;
  }

  delete(filePath: string): void {
    if (this.files.delete(filePath)) this.dirty = true;
  }

  save(path: string): void {
    if (!this.dirty) return;
    mkdirSync(dirname(path), { recursive: true });
    const out: CacheFile = { version: 1, files: {} };
    for (const [filePath, entry] of this.files) {
      out.files[filePath] = { hash: entry.hash, units: entry.units.map(serializeUnit) };
    }
    writeFileSync(path, JSON.stringify(out), "utf8");
    this.dirty = false;
  }
}

function serializeUnit(unit: CodeUnit): SerializedUnit {
  return {
    ...unit,
    shingles: [...unit.shingles],
    identifierBag: [...unit.identifierBag.entries()],
  };
}

function deserializeUnit(unit: SerializedUnit): CodeUnit {
  return {
    ...unit,
    shingles: new Set(unit.shingles),
    identifierBag: new Map(unit.identifierBag),
  };
}
