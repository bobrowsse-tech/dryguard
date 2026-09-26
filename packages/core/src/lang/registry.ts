import { extname } from "node:path";
import { TsAdapter } from "./tsAdapter.js";
import { createDefaultTreeSitterAdapters, TreeSitterAdapter } from "./treeSitterAdapter.js";
import type { LanguageAdapter } from "./types.js";

/** Resolves a `LanguageAdapter` by file extension. */
export class LanguageRegistry {
  private readonly byExtension = new Map<string, LanguageAdapter>();
  readonly treeSitterAdapters: TreeSitterAdapter[];

  constructor(grammarsDir: string) {
    const ts = new TsAdapter();
    for (const ext of ts.extensions) this.byExtension.set(ext, ts);

    this.treeSitterAdapters = createDefaultTreeSitterAdapters(grammarsDir);
    for (const adapter of this.treeSitterAdapters) {
      for (const ext of adapter.extensions) this.byExtension.set(ext, adapter);
    }
  }

  forFile(filePath: string): LanguageAdapter | undefined {
    const ext = extname(filePath).slice(1).toLowerCase();
    return this.byExtension.get(ext);
  }

  isTreeSitter(adapter: LanguageAdapter): adapter is TreeSitterAdapter {
    return adapter instanceof TreeSitterAdapter;
  }

  /** Pre-loads every tree-sitter grammar that's actually available on disk; silently skips missing ones. */
  async warmUp(): Promise<void> {
    await Promise.all(
      this.treeSitterAdapters.map((a) => a.warmUp().catch(() => undefined)),
    );
  }
}
