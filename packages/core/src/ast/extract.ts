import {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  MethodDeclaration,
  Node,
  SourceFile,
  SyntaxKind,
} from "ts-morph";

export type ExtractableFunction =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction
  | MethodDeclaration;

/** Minimum statement count for a function body to be worth indexing/comparing. */
const MIN_STATEMENTS = 3;

/**
 * Walks a source file and returns every function-like node big enough to be
 * a meaningful DRY candidate (skips trivial one-liners and stubs, and
 * anything preceded by the configured ignore comment).
 */
export function extractFunctions(
  sourceFile: SourceFile,
  options: { ignoreComment: string } = { ignoreComment: "dryguard-ignore" },
): ExtractableFunction[] {
  const results: ExtractableFunction[] = [];

  sourceFile.forEachDescendant((node) => {
    if (
      Node.isFunctionDeclaration(node) ||
      Node.isFunctionExpression(node) ||
      Node.isArrowFunction(node) ||
      Node.isMethodDeclaration(node)
    ) {
      const body = node.getBody();
      if (!body) return;

      if (isIgnored(node, options.ignoreComment)) return;

      const statementCount = Node.isBlock(body)
        ? body.getStatements().length
        : 1; // expression-bodied arrow function

      if (statementCount >= MIN_STATEMENTS || hasMeaningfulControlFlow(node)) {
        results.push(node);
      }
    }
  });

  return results;
}

/** True if a `// dryguard-ignore` (or matching marker) leading comment precedes this node. */
function isIgnored(node: Node, marker: string): boolean {
  const ranges = [
    ...node.getLeadingCommentRanges(),
    ...(Node.isArrowFunction(node) ? node.getParent()?.getLeadingCommentRanges() ?? [] : []),
  ];
  return ranges.some((r) => r.getText().includes(marker));
}

function hasMeaningfulControlFlow(node: Node): boolean {
  const controlFlowKinds = new Set([
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.TryStatement,
  ]);
  let found = false;
  node.forEachDescendant((d, traversal) => {
    if (controlFlowKinds.has(d.getKind())) {
      found = true;
      traversal.stop();
    }
  });
  return found;
}

/** Best-effort human-readable name for a function-like node. */
export function nameOf(node: ExtractableFunction): string {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    return node.getName() ?? "<anonymous>";
  }
  // Arrow / function expressions: try the variable/property it's assigned to.
  const parent = node.getParent();
  if (Node.isVariableDeclaration(parent) || Node.isPropertyAssignment(parent)) {
    return parent.getName?.() ?? "<anonymous>";
  }
  return "<anonymous>";
}
