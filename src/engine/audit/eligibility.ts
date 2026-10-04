import type { RequirementRow } from "@/lib/data/schema";
import type { CourseFact } from "./courses";
import { meetsMinimum } from "./grades";
import type { Policy } from "./types";

// Is a course eligible for a requirement row? See docs/engine-spec.md section 3.
// "maybe" means the answer depends on data we don't have; it carries the reason.

export type Eligibility =
  { kind: "yes" } | { kind: "no" } | { kind: "maybe"; reason: string };

const YES: Eligibility = { kind: "yes" };
const NO: Eligibility = { kind: "no" };

export function and(a: Eligibility, b: Eligibility): Eligibility {
  if (a.kind === "no" || b.kind === "no") return NO;
  if (a.kind === "maybe") return a;
  return b;
}

export type EligibilityContext = {
  policy: Policy;
  rowsById: Map<string, RequirementRow>;
  /** Units earned in this tier, for `earned_units >= N`. */
  earnedUnits: number;
};

/** The course list a row draws from: its own `courses`, or the union named by from_reqs. */
export function rowCourseList(
  row: RequirementRow,
  rowsById: Map<string, RequirementRow>,
): string[] | null {
  if (row.courses.length > 0) return row.courses;
  const ids = row.filter.flatMap(
    (t) => /^from_reqs (.+)$/.exec(t)?.[1]?.split("|") ?? [],
  );
  if (ids.length === 0) return null;
  return [...new Set(ids.flatMap((id) => rowsById.get(id)?.courses ?? []))];
}

/** The row named by a `within` term, if any. */
export function withinParent(row: RequirementRow): string | null {
  for (const term of row.filter) {
    const m = /^within (\S+)$/.exec(term);
    if (m) return m[1]!;
  }
  return null;
}

function unitsAtLeast(fact: CourseFact, n: number): Eligibility {
  if (fact.units === null)
    return {
      kind: "maybe",
      reason: `no course data for ${fact.code}: units unknown`,
    };
  return fact.units >= n ? YES : NO;
}

function filterTerm(
  term: string,
  fact: CourseFact,
  ctx: EligibilityContext,
): Eligibility {
  const major = ctx.policy.major_subjects.subjects;
  let m: RegExpExecArray | null;
  if ((m = /^dept not in (.+)$/.exec(term)))
    return m[1]!.split(",").includes(fact.dept) ? NO : YES;
  if ((m = /^dept (.+)$/.exec(term)))
    return m[1]!.split(",").includes(fact.dept) ? YES : NO;
  if (term === "subject business") return fact.dept === "BUS" ? YES : NO; // ASSUMPTION (OPEN-6)
  if (term === "subject outside major")
    return major.includes(fact.dept) ? NO : YES;
  if (term === "subject in major") return major.includes(fact.dept) ? YES : NO;
  if (term === "outside Beedie")
    return fact.dept === "BUS" || fact.dept === "BUEC" ? NO : YES; // ASSUMPTION (OPEN-7)
  if (term === "institution SFU") return fact.institution === "SFU" ? YES : NO;
  if ((m = /^if institution SFU then course_units >= (\S+)$/.exec(term))) {
    return fact.institution === "SFU" ? unitsAtLeast(fact, Number(m[1])) : YES;
  }
  if ((m = /^course_units >= (\S+)$/.exec(term)))
    return unitsAtLeast(fact, Number(m[1]));
  if ((m = /^exclude (.+)$/.exec(term)))
    return m[1]!.split("|").includes(fact.code) ? NO : YES;
  if ((m = /^earned_units >= (\S+)$/.exec(term)))
    return ctx.earnedUnits >= Number(m[1]) ? YES : NO;
  if (term === "program courses")
    return {
      kind: "maybe",
      reason: "program courses are not defined in the data",
    };
  // Handled elsewhere (rule evaluators, matching) or always true for this student.
  if (
    /^(purpose |group |from_reqs |within |level )/.test(term) ||
    term === "all courses" ||
    term === "degree first_bachelors" ||
    term === "not allocated to designated breadth"
  ) {
    return YES;
  }
  return {
    kind: "maybe",
    reason: `filter term not supported by the engine: ${term}`,
  };
}

/** Eligibility from the row's own list, level, designation, filters and grade (not `within`). */
export function ownEligibility(
  row: RequirementRow,
  fact: CourseFact,
  ctx: EligibilityContext,
): Eligibility {
  const list = rowCourseList(row, ctx.rowsById);
  if (list && !list.includes(fact.code)) return NO;
  if (row.level_min !== null && fact.number < row.level_min) return NO;
  if (row.level_max !== null && fact.number > row.level_max) return NO;

  let result: Eligibility = YES;
  for (const term of row.filter) {
    result = and(result, filterTerm(term, fact, ctx));
    if (result.kind === "no") return NO;
  }

  if (row.designation.length > 0) {
    if (fact.designations === null) {
      result = and(result, {
        kind: "maybe",
        reason: `designation of ${fact.code} unknown (no course data)`,
      });
    } else if (
      !fact.designations.some((d) => (row.designation as string[]).includes(d))
    ) {
      return NO;
    }
  }

  // Topics courses BUS 490-495 count for a concentration only with its topic.
  if (
    row.concentration !== null &&
    fact.dept === "BUS" &&
    fact.number >= 490 &&
    fact.number <= 495
  ) {
    result = and(result, {
      kind: "maybe",
      reason: `${fact.code} is a topics course: topic not recorded`,
    });
  }

  if (!fact.pending) {
    if (!meetsMinimum(fact.grade, row.min_grade, fact.code, ctx.policy))
      return NO;
    // W/Q/B credit needs C- or better (policy wqb_min_grade).
    if (
      row.designation.length > 0 &&
      !meetsMinimum(
        fact.grade,
        ctx.policy.wqb_min_grade.min_grade,
        fact.code,
        ctx.policy,
      )
    ) {
      return NO;
    }
  }
  return result;
}

/** Full eligibility: own, and for a `within` row also the parent's. */
export function eligibility(
  row: RequirementRow,
  fact: CourseFact,
  ctx: EligibilityContext,
): Eligibility {
  const own = ownEligibility(row, fact, ctx);
  const parentId = withinParent(row);
  const parent = parentId ? ctx.rowsById.get(parentId) : undefined;
  return parent ? and(own, ownEligibility(parent, fact, ctx)) : own;
}
