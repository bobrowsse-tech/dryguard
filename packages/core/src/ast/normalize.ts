import { Node, SyntaxKind } from "ts-morph";
import type { ExtractableFunction } from "./extract.js";
import type { UnitSignature } from "../types.js";

export interface AnalyzedFunction {
  tokens: string[];
  /** Real (un-folded) names of call targets / property accesses / free identifiers referenced. */
  identifierBag: Map<string, number>;
  signature: UnitSignature;
}

/**
 * Single traversal that produces everything needed for both comparison
 * tiers: a normalized token stream for structural (Jaccard) comparison,
 * where identifiers are folded to their syntactic role and literal values
 * are folded to their type — so `calculateTax(price)` and
 * `computeTax(amount)` compare as structurally identical — and, separately,
 * a bag of the *real* names referenced (call targets, property accesses,
 * free identifiers), which the opt-in semantic tier uses to catch functions
 * that do the same thing via a different structural shape.
 */
export function analyzeFunction(node: ExtractableFunction): AnalyzedFunction {
  const tokens: string[] = [];
  const identifierBag = new Map<string, number>();
  const localNames = new Set<string>();
  let branchCount = 0;

  for (const param of node.getParameters()) {
    localNames.add(param.getName());
  }

  const branchKinds = new Set([
    SyntaxKind.IfStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.WhileStatement,
    SyntaxKind.SwitchStatement,
    SyntaxKind.TryStatement,
  ]);

  node.forEachDescendant((child) => {
    const kind = child.getKind();
    if (branchKinds.has(kind)) branchCount++;

    switch (kind) {
      case SyntaxKind.Identifier: {
        const text = child.getText();
        if (localNames.has(text)) {
          tokens.push("ID_LOCAL");
        } else {
          tokens.push("ID_REF");
          identifierBag.set(text, (identifierBag.get(text) ?? 0) + 1);
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
      case SyntaxKind.VariableDeclaration:
        if (Node.isVariableDeclaration(child)) {
          localNames.add(child.getName());
        }
        break;
      default:
        break;
    }

    if (STRUCTURAL_KINDS.has(kind)) {
      tokens.push(SyntaxKind[kind]);
    }
  });

  return {
    tokens,
    identifierBag,
    signature: {
      paramCount: node.getParameters().length,
      tokenCount: tokens.length,
      branchCount,
    },
  };
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
