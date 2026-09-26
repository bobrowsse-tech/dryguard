import { Node, SyntaxKind } from "ts-morph";
import type { ExtractableFunction } from "./extract.js";
import type { UnitSignature } from "../types.js";

/**
 * Produces a normalized token stream for a function-like node: identifiers
 * are folded to their syntactic role (parameter, local, call target, etc.)
 * rather than their literal name, and literal values are folded to their
 * type. This is what lets `calculateTax(price)` and `computeTax(amount)`
 * compare as structurally identical even though no name matches.
 */
export function normalizeToTokens(node: ExtractableFunction): string[] {
  const tokens: string[] = [];
  const localNames = new Set<string>();

  // Seed local names from parameters so param usage folds consistently.
  for (const param of node.getParameters()) {
    localNames.add(param.getName());
  }

  node.forEachDescendant((child) => {
    const kind = child.getKind();

    switch (kind) {
      case SyntaxKind.Identifier: {
        const text = child.getText();
        if (localNames.has(text)) {
          tokens.push("ID_LOCAL");
        } else {
          // Could be a call target, global, or member — keep a coarse role.
          tokens.push("ID_REF");
        }
        return;
      }
      case SyntaxKind.StringLiteral:
      case SyntaxKind.NoSubstitutionTemplateLiteral:
        tokens.push("LIT_STRING");
        return;
      case SyntaxKind.NumericLiteral:
        tokens.push("LIT_NUMBER");
        return;
      case SyntaxKind.TrueKeyword:
      case SyntaxKind.FalseKeyword:
        tokens.push("LIT_BOOL");
        return;
      case SyntaxKind.VariableDeclaration: {
        if (Node.isVariableDeclaration(child)) {
          localNames.add(child.getName());
        }
        break;
      }
      default:
        break;
    }

    // Structural keywords: keep the syntax kind name itself, it's the shape
    // we care about (IfStatement, ForStatement, BinaryExpression, ...).
    if (isStructuralKind(kind)) {
      tokens.push(SyntaxKind[kind]);
    }
  });

  return tokens;
}

const STRUCTURAL_KINDS = new Set<SyntaxKind>([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.TryStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
  SyntaxKind.BinaryExpression,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.CallExpression,
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.ElementAccessExpression,
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.ObjectLiteralExpression,
  SyntaxKind.AwaitExpression,
]);

function isStructuralKind(kind: SyntaxKind): boolean {
  return STRUCTURAL_KINDS.has(kind);
}

/** Builds shingles (sliding windows of N tokens) for Jaccard-style comparison. */
export function toShingles(tokens: string[], windowSize = 5): Set<string> {
  if (tokens.length < windowSize) {
    return new Set([tokens.join(" ")]);
  }
  const shingles = new Set<string>();
  for (let i = 0; i <= tokens.length - windowSize; i++) {
    shingles.add(tokens.slice(i, i + windowSize).join(" "));
  }
  return shingles;
}

export function computeSignature(
  node: ExtractableFunction,
  tokens: string[],
): UnitSignature {
  let branchCount = 0;
  const branchKinds = new Set([
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.TryStatement,
  ]);
  node.forEachDescendant((d) => {
    if (branchKinds.has(d.getKind())) branchCount++;
  });

  return {
    paramCount: node.getParameters().length,
    tokenCount: tokens.length,
    branchCount,
  };
}
