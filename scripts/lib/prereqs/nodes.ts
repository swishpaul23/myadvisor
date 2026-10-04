import type { PrereqNode } from "@/lib/data/prereqs";
import { classifyFragment } from "./fragments";
import type { Grade } from "./lexer";

/** A fragment the grammar doesn't parse: a typed count/permission/restriction node for
 * an exact pattern (fragments.ts), otherwise an unknown node with the text verbatim. */
export const unknown = (text: string): PrereqNode => classifyFragment(text);

/** Nodes that carry text instead of structure (anything but course/units/all/any). */
export function isTextNode(node: PrereqNode): boolean {
  return (
    node.type === "unknown" ||
    node.type === "count" ||
    node.type === "permission" ||
    node.type === "restriction"
  );
}

export function course(code: string, concurrentOk = false): PrereqNode {
  return { type: "course", code, minGrade: null, concurrentOk };
}

/** all/any with nested groups of the same type flattened; one child returns the child. */
export function group(type: "all" | "any", children: PrereqNode[]): PrereqNode {
  const flat = children.flatMap((c) => (c.type === type ? c.of : [c]));
  if (flat.length === 1) return flat[0]!;
  return { type, of: flat };
}

export function walk(
  node: PrereqNode | null,
  visit: (n: PrereqNode) => void,
): void {
  if (!node) return;
  visit(node);
  if (node.type === "all" || node.type === "any") {
    for (const child of node.of) walk(child, visit);
  }
}

export function hasUnits(node: PrereqNode): boolean {
  let found = false;
  walk(node, (n) => {
    if (n.type === "units") found = true;
  });
  return found;
}

/** Sets minGrade on every course in `node` that doesn't have one yet. */
export function applyGrade(node: PrereqNode, grade: Grade): void {
  walk(node, (n) => {
    if (n.type === "course" && n.minGrade === null) n.minGrade = grade;
  });
}

export function markConcurrent(node: PrereqNode): void {
  walk(node, (n) => {
    if (n.type === "course") n.concurrentOk = true;
  });
}

export function unknownTexts(node: PrereqNode | null): string[] {
  const out: string[] = [];
  walk(node, (n) => {
    if (n.type === "unknown") out.push(n.text);
  });
  return out;
}

export function countKnown(node: PrereqNode | null): number {
  let n = 0;
  walk(node, (x) => {
    // Everything recognized: all leaves except unknown.
    if (x.type !== "unknown" && x.type !== "all" && x.type !== "any") n++;
  });
  return n;
}

export function courseCodes(node: PrereqNode | null): string[] {
  const out: string[] = [];
  walk(node, (n) => {
    if (n.type === "course") out.push(n.code);
  });
  return out;
}
