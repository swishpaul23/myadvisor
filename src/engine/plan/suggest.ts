import { audit } from "../audit/audit";
import type { Student } from "../audit/types";
import type {
  Declarations,
  Plan,
  PlanCatalog,
  PlanValidation,
  ViolationCode,
} from "./types";
import { validatePlan } from "./validate";

// Next-term suggestion (rule decided by Stuart, 2026-10-04). Deterministic; no ranking or
// preference logic, and it never decides a requirement itself: the audit says which rows
// are unmet and the validator says whether a course can be taken that term.
//
// 1. Candidates: the course of every unmet requirement row that names exactly one course,
//    in sheet order, each code once. Rows with a choice ("one course" with options,
//    "n courses") are not candidates; they stay open slots for the student.
// 2. A candidate is chosen when validatePlan, with the candidate alone in the plan term,
//    reports no violation for it: prerequisites met (not unknown, not permission-only),
//    offered that season, course data present, not already taken.
// 3. Chosen courses fill the course load in candidate order; the rest are open slots.
// 4. The chosen courses are validated together and the result is returned with them.

export type SuggestOptions = {
  /** The term to plan, e.g. "2027-spring". */
  termId: string;
  /** Courses the student wants that term (open slots included). */
  courseLoad: number;
};

export type Suggestion = {
  termId: string;
  /** Chosen courses in candidate order, with the requirement rows each one fills. */
  courses: { code: string; reqIds: string[] }[];
  /** Slots left for the student's own choice ("Your choice"). */
  openSlots: number;
  /** Candidates that couldn't be suggested, with the validator's reasons. */
  skipped: { code: string; reqIds: string[]; reasons: ViolationCode[] }[];
  /** The plan that was validated: one study term with the chosen courses. */
  plan: Plan;
  validation: PlanValidation;
};

const termPlan = (termId: string, courses: string[]): Plan => ({
  terms: [{ id: termId, kind: "study", courses }],
});

export function suggestNextTerm(
  student: Student,
  catalog: PlanCatalog,
  options: SuggestOptions,
  declarations: Declarations = {},
): Suggestion {
  const { termId, courseLoad } = options;
  const statusById = new Map(
    audit(student, catalog).results.map((r) => [r.reqId, r.status]),
  );

  // 1. Candidates, in sheet order.
  const candidates = new Map<string, string[]>();
  for (const row of catalog.requirements) {
    if (row.status === "out-of-scope") continue;
    if (row.rule !== "one course" || row.courses.length !== 1) continue;
    if (statusById.get(row.req_id) !== "unmet") continue;
    const code = row.courses[0]!;
    candidates.set(code, [...(candidates.get(code) ?? []), row.req_id]);
  }

  // 2. Each candidate on its own in the plan term.
  const chosen: Suggestion["courses"] = [];
  const skipped: Suggestion["skipped"] = [];
  for (const [code, reqIds] of candidates) {
    const alone = validatePlan(
      student,
      termPlan(termId, [code]),
      catalog,
      declarations,
    );
    const reasons = [
      ...new Set(
        alone.violations
          .filter((v) => v.courseCode === code)
          .map((v) => v.code),
      ),
    ];
    if (reasons.length > 0) skipped.push({ code, reqIds, reasons });
    else if (chosen.length < courseLoad) chosen.push({ code, reqIds });
  }

  // 3-4. Fill the load; validate the chosen courses together.
  const plan = termPlan(
    termId,
    chosen.map((c) => c.code),
  );
  return {
    termId,
    courses: chosen,
    openSlots: Math.max(courseLoad - chosen.length, 0),
    skipped,
    plan,
    validation: validatePlan(student, plan, catalog, declarations),
  };
}
