import type { PrereqNode } from "@/lib/data/prereqs";
import { meetsMinimum } from "../audit/grades";
import type { Policy } from "../audit/types";
import type { Declarations } from "../plan/types";

// Three-valued prerequisite evaluation (docs/validator-spec.md section 2). Pure.

export type Truth = "met" | "unmet" | "unknown";

export type PassedCourse = {
  code: string;
  dept: string;
  number: number;
  units: number | null;
};

export type PrereqContext = {
  policy: Policy;
  /** Best completed grade per course (any grade, including failing ones). */
  completed: Map<string, string>;
  /** In-progress courses and courses planned in earlier terms (assumed passed). */
  earlier: Set<string>;
  /** Other courses planned in the same term. */
  sameTerm: Set<string>;
  /** Courses passed or assumed passed before this term, once each (for units and count). */
  passedBefore: PassedCourse[];
  student: { program: string; admissionTerm: string };
  declarations: Declarations;
};

export type EvalResult = {
  truth: Truth;
  /** Unmet, but a permission node is the only thing missing (waivable). */
  needsPermission: boolean;
  notes: string[];
  /** Why the result is unknown (texts of unknown/restriction/external nodes, etc.). */
  reasons: string[];
};

const TERM_ORDER = ["spring", "summer", "fall"];
const termOrdinal = (term: string) => {
  const [year, name] = term.split("-");
  return Number(year) * 3 + TERM_ORDER.indexOf(name ?? "");
};

type Inner = { truth: Truth; notes: string[]; reasons: string[] };

function leaf(
  truth: Truth,
  notes: string[] = [],
  reasons: string[] = [],
): Inner {
  return { truth, notes, reasons };
}

function evaluate(
  node: PrereqNode,
  ctx: PrereqContext,
  mode: "prereq" | "coreq",
  permission: Truth,
): Inner {
  switch (node.type) {
    case "course": {
      const grade = ctx.completed.get(node.code);
      if (
        grade !== undefined &&
        meetsMinimum(grade, node.minGrade, node.code, ctx.policy)
      ) {
        const notes =
          grade === ctx.policy.transfer_credit.grade
            ? [
                `${node.code}: transfer credit (CR), grade not known; assumed to meet the minimum.`,
              ]
            : [];
        return leaf("met", notes);
      }
      if (ctx.earlier.has(node.code)) {
        return leaf(
          "met",
          node.minGrade
            ? [`${node.code}: assumes a grade of at least ${node.minGrade}.`]
            : [],
        );
      }
      if (
        ctx.sameTerm.has(node.code) &&
        (node.concurrentOk || mode === "coreq")
      ) {
        return leaf("met", [`${node.code} is taken concurrently.`]);
      }
      const required = node.minGrade ? ` (minimum ${node.minGrade})` : "";
      const note =
        grade !== undefined
          ? `${node.code}: completed with ${grade}, below the required ${node.minGrade ?? "passing grade"}.`
          : ctx.sameTerm.has(node.code)
            ? `${node.code}${required} is in the same term; it must be completed in an earlier term.`
            : `${node.code}${required} is not completed or planned earlier.`;
      return leaf("unmet", [note]);
    }

    case "all":
    case "any": {
      let children = node.of;
      const notes: string[] = [];
      if (node.type === "any") {
        const alts = children.filter((c) => c.type === "alt_group");
        for (const a of alts)
          if (a.type === "alt_group")
            notes.push(`An alternative route exists for ${a.group}.`);
        children = children.filter((c) => c.type !== "alt_group");
        if (children.length === 0)
          return leaf("unknown", notes, ["only alternative-route groups"]);
      }
      const results = children.map((c) => evaluate(c, ctx, mode, permission));
      const reasons = results.flatMap((r) =>
        r.truth === "unknown" ? r.reasons : [],
      );
      const truths = results.map((r) => r.truth);
      let truth: Truth;
      if (node.type === "all")
        truth = truths.includes("unmet")
          ? "unmet"
          : truths.includes("unknown")
            ? "unknown"
            : "met";
      else
        truth = truths.includes("met")
          ? "met"
          : truths.includes("unknown")
            ? "unknown"
            : "unmet";
      // Keep the notes of the children that decide the result (e.g. for an unmet "all",
      // the unmet children), so a met alternative doesn't carry notes about the others.
      for (const r of results) if (r.truth === truth) notes.push(...r.notes);
      return leaf(truth, notes, truth === "unknown" ? reasons : []);
    }

    case "units": {
      const pool = ctx.passedBefore.filter((p) => {
        if (node.subject && p.dept !== node.subject) return false;
        if (node.level === "upper" && (p.number < 300 || p.number > 499))
          return false;
        if (node.level === "lower" && (p.number < 100 || p.number > 299))
          return false;
        return true;
      });
      const known = pool.reduce((n, p) => n + (p.units ?? 0), 0);
      if (known >= node.min) return leaf("met");
      const unknownUnits = pool.filter((p) => p.units === null);
      if (unknownUnits.length > 0) {
        return leaf(
          "unknown",
          [],
          [`units unknown for ${unknownUnits.map((p) => p.code).join(", ")}`],
        );
      }
      return leaf("unmet", [`${known} of ${node.min} units before this term.`]);
    }

    case "count": {
      if (!node.subject || node.level === undefined)
        return leaf("unknown", [], [node.text]);
      const level = node.level;
      const n = ctx.passedBefore.filter(
        (p) =>
          p.dept === node.subject &&
          p.number >= level &&
          p.number <= level + 99,
      ).length;
      return leaf(n >= node.n ? "met" : "unmet");
    }

    case "permission":
      return leaf(
        permission,
        permission === "met" ? [] : [`Needs ${node.text}.`],
      );

    case "restriction": {
      const entry = ctx.policy.restriction_programs.entries.find(
        (e) => e.text === node.text,
      );
      if (!entry) return leaf("unknown", [], [node.text]);
      const programOk = ctx.student.program === entry.program;
      const termOk =
        entry.admitted_from === null ||
        termOrdinal(ctx.student.admissionTerm) >=
          termOrdinal(entry.admitted_from);
      return leaf(
        programOk && termOk ? "met" : "unmet",
        programOk && termOk ? [] : [`Restricted: ${node.text}.`],
      );
    }

    case "external": {
      const answer = ctx.declarations.external?.[node.text];
      if (answer === undefined)
        return leaf("unknown", [], [`needs your answer: ${node.text}`]);
      return leaf(answer ? "met" : "unmet");
    }

    case "alt_group":
      return leaf(
        "unknown",
        [],
        [`alternative route outside an "or": ${node.text}`],
      );

    case "unknown":
      return leaf("unknown", [], [node.text]);
  }
}

export function evaluateNode(
  node: PrereqNode,
  ctx: PrereqContext,
  mode: "prereq" | "coreq",
): EvalResult {
  const result = evaluate(node, ctx, mode, "unmet");
  let needsPermission = false;
  if (result.truth === "unmet") {
    // Is a permission node the only thing missing? Re-evaluate with permissions granted.
    needsPermission = evaluate(node, ctx, mode, "met").truth === "met";
  }
  return {
    truth: result.truth,
    needsPermission,
    notes: [...new Set(result.notes)],
    reasons: [...new Set(result.reasons)],
  };
}
