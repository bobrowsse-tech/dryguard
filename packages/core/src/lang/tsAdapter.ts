import { Project } from "ts-morph";
import { extractFunctions, nameOf } from "../ast/extract.js";
import { analyzeFunction } from "../ast/normalize.js";
import type { ExtractedUnit, LanguageAdapter } from "./types.js";

/**
 * TypeScript/JavaScript adapter, backed by ts-morph. This is the reference
 * implementation — full identifier-role folding (param vs. free reference),
 * so it's the most precise adapter. Non-TS-family adapters (see
 * `treeSitterAdapter.ts`) trade some of that precision for broad language
 * coverage via a single generic implementation.
 */
export class TsAdapter implements LanguageAdapter {
  readonly id = "typescript";
  readonly extensions = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];

  // One throwaway in-memory project per call keeps this adapter stateless
  // and safe to call repeatedly (WorkspaceIndex owns the real, persistent
  // ts-morph Project it uses for the workspace itself; this one is only
  // used when analyzing a standalone snippet, e.g. from the CLI or a
  // semantic-only caller that doesn't need incremental re-parsing).
  extract(sourceText: string, options: { ignoreComment: string }): ExtractedUnit[] {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
    const sourceFile = project.createSourceFile("__dryguard_snippet__.tsx", sourceText);
    return extractFunctions(sourceFile, options).map((fn) => {
      const analyzed = analyzeFunction(fn);
      return {
        name: nameOf(fn),
        startLine: fn.getStartLineNumber(),
        endLine: fn.getEndLineNumber(),
        sourceText: fn.getText(),
        normalizedTokens: analyzed.tokens,
        identifierBag: analyzed.identifierBag,
        paramCount: analyzed.signature.paramCount,
        branchCount: analyzed.signature.branchCount,
      };
    });
  }
}
