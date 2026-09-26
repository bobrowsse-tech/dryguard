import { existsSync } from "node:fs";
import { join } from "node:path";
import Parser from "web-tree-sitter";
import type { ExtractedUnit, LanguageAdapter } from "./types.js";

/**
 * Generic adapter for any tree-sitter grammar. Trades some precision
 * against `TsAdapter`: tree-sitter's parse tree doesn't distinguish "this
 * identifier is a parameter" from "this identifier is a free reference"
 * without per-grammar query files, so every identifier folds to one
 * `ID_REF` token rather than `ID_LOCAL`/`ID_REF`. In practice this still
 * catches renamed-parameter duplicates well via the surrounding structural
 * tokens and the semantic tier; it's just slightly less precise than the
 * TS/JS path. Extend `FUNCTION_NODE_TYPES` / `STRUCTURAL_NODE_TYPES` per
 * grammar as coverage grows.
 */
// web-tree-sitter shares one emscripten module. Loading two grammars at
// once leaves exports such as `tree_sitter_python_external_scanner_create`
// unresolved on Node 18 and 20.
let grammarLoadQueue: Promise<void> = Promise.resolve();

function loadGrammarExclusively<T>(load: () => Promise<T>): Promise<T> {
  const result = grammarLoadQueue.then(load, load);
  grammarLoadQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export class TreeSitterAdapter implements LanguageAdapter {
  private parser: Parser | undefined;
  private initPromise: Promise<void> | undefined;

  constructor(
    readonly id: string,
    readonly extensions: string[],
    private readonly wasmPath: string,
  ) {}

  private async ensureReady(): Promise<Parser> {
    if (this.parser) return this.parser;
    if (!this.initPromise) {
      this.initPromise = loadGrammarExclusively(async () => {
        await Parser.init();
        const parser = new Parser();
        if (!existsSync(this.wasmPath)) {
          throw new Error(
            `DryGuard: missing tree-sitter grammar for '${this.id}' at ${this.wasmPath}. ` +
              `Run 'node scripts/fetch-grammars.mjs' (see AGENTS.md) once you have network access.`,
          );
        }
        const lang = await Parser.Language.load(this.wasmPath);
        parser.setLanguage(lang);
        this.parser = parser;
      });
    }
    await this.initPromise;
    return this.parser!;
  }

  /**
   * Synchronous extraction isn't possible with web-tree-sitter's async
   * init, so `WorkspaceIndex` awaits `extractAsync` for these extensions;
   * `extract` (the sync `LanguageAdapter` method) throws if the grammar
   * hasn't been warmed up yet via `warmUp()`.
   */
  extract(sourceText: string, options: { ignoreComment: string }): ExtractedUnit[] {
    if (!this.parser) {
      throw new Error(
        `DryGuard: '${this.id}' grammar not warmed up — call warmUp() (WorkspaceIndex does this automatically) before extract().`,
      );
    }
    return this.extractWithParser(this.parser, sourceText, options);
  }

  async warmUp(): Promise<void> {
    await this.ensureReady();
  }

  async extractAsync(sourceText: string, options: { ignoreComment: string }): Promise<ExtractedUnit[]> {
    const parser = await this.ensureReady();
    return this.extractWithParser(parser, sourceText, options);
  }

  private extractWithParser(
    parser: Parser,
    sourceText: string,
    options: { ignoreComment: string },
  ): ExtractedUnit[] {
    const tree = parser.parse(sourceText);
    const results: ExtractedUnit[] = [];
    const functionTypes = FUNCTION_NODE_TYPES[this.id] ?? DEFAULT_FUNCTION_NODE_TYPES;
    const nameField = NAME_FIELD[this.id] ?? "name";

    const visit = (node: Parser.SyntaxNode) => {
      if (functionTypes.has(node.type)) {
        const precedingComment = findPrecedingComment(node);
        const isIgnored = precedingComment?.includes(options.ignoreComment) ?? false;
        const statementCount = countStatements(node);
        if (!isIgnored && (statementCount >= 3 || hasBranch(node))) {
          results.push(toUnit(node, nameField, sourceText));
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visit(child);
      }
    };
    visit(tree.rootNode);
    return results;
  }
}

const DEFAULT_FUNCTION_NODE_TYPES = new Set(["function_definition", "function_declaration", "method_declaration"]);

const FUNCTION_NODE_TYPES: Record<string, Set<string>> = {
  python: new Set(["function_definition"]),
  go: new Set(["function_declaration", "method_declaration"]),
};

const NAME_FIELD: Record<string, string> = {
  python: "name",
  go: "name",
};

const STRUCTURAL_NODE_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "switch_statement",
  "try_statement",
  "except_clause",
  "case_clause",
  "return_statement",
  "raise_statement",
  "binary_operator",
  "binary_expression",
  "call",
  "call_expression",
  "conditional_expression",
  "attribute",
  "selector_expression",
  "list",
  "dictionary",
  "composite_literal",
]);

const BRANCH_NODE_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "while_statement",
  "switch_statement",
  "try_statement",
]);

const LITERAL_TYPES: Record<string, string> = {
  string: "LIT_STRING",
  string_literal: "LIT_STRING",
  interpreted_string_literal: "LIT_STRING",
  integer: "LIT_NUMBER",
  float: "LIT_NUMBER",
  int_literal: "LIT_NUMBER",
  true: "LIT_BOOL",
  false: "LIT_BOOL",
};

function toUnit(node: Parser.SyntaxNode, nameField: string, sourceText: string): ExtractedUnit {
  const nameNode = node.childForFieldName(nameField);
  const name = nameNode?.text ?? "<anonymous>";
  const tokens: string[] = [];
  const identifierBag = new Map<string, number>();
  let branchCount = 0;
  let paramCount = 0;

  const paramsNode =
    node.childForFieldName("parameters") ?? node.childForFieldName("parameter_list");
  if (paramsNode) {
    paramCount = paramsNode.namedChildren.length;
  }

  const walk = (n: Parser.SyntaxNode) => {
    if (BRANCH_NODE_TYPES.has(n.type)) branchCount++;

    if (n.type === "identifier") {
      tokens.push("ID_REF");
      identifierBag.set(n.text, (identifierBag.get(n.text) ?? 0) + 1);
    } else if (LITERAL_TYPES[n.type]) {
      tokens.push(LITERAL_TYPES[n.type]);
    } else if (STRUCTURAL_NODE_TYPES.has(n.type)) {
      tokens.push(n.type);
    }

    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  };
  walk(node);

  return {
    name,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    sourceText: sourceText.slice(node.startIndex, node.endIndex),
    normalizedTokens: tokens,
    identifierBag,
    paramCount,
    branchCount,
  };
}

function countStatements(node: Parser.SyntaxNode): number {
  const body = node.childForFieldName("body");
  return body ? body.namedChildren.length : 1;
}

function hasBranch(node: Parser.SyntaxNode): boolean {
  let found = false;
  const walk = (n: Parser.SyntaxNode) => {
    if (found) return;
    if (BRANCH_NODE_TYPES.has(n.type)) {
      found = true;
      return;
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  };
  walk(node);
  return found;
}

function findPrecedingComment(node: Parser.SyntaxNode): string | undefined {
  const prev = node.previousNamedSibling;
  if (prev && prev.type === "comment") return prev.text;
  return undefined;
}

/** Builds the standard Python + Go adapters, pointing at grammars fetched by `scripts/fetch-grammars.mjs`. */
export function createDefaultTreeSitterAdapters(grammarsDir: string): TreeSitterAdapter[] {
  return [
    new TreeSitterAdapter("python", ["py"], join(grammarsDir, "python.wasm")),
    new TreeSitterAdapter("go", ["go"], join(grammarsDir, "go.wasm")),
  ];
}
