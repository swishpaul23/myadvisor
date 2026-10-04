import type { RequirementRow } from "@/lib/data/schema";
import { audit } from "../audit/audit";
import { rowCourseList } from "../audit/eligibility";
import { attemptScore, meetsMinimum } from "../audit/grades";
import { isSlotRow } from "../audit/rules";
import type {
  AuditResult,
  ReqStatus,
  Student,
  StudentCourse,
} from "../audit/types";
import type {
  Declarations,
  Plan,
  PlanCatalog,
  PlanTerm,
  PlanValidation,
  ViolationCode,
} from "./types";
import { validatePlan } from "./validate";

// Multi-term plan (rules decided by Stuart, 2026-10-04): every term from the start term
// until the remaining requirements are planned. Deterministic. The audit says what is
// still open and the validator says whether a course can be taken in a term; this file
// only orders the work.
//
// 1. Named courses: for every unmet row with a course list (sheet order), the courses it
//    still needs. A single-course row names its course; a row with options takes the first
//    options in list order, preferring ones with course data and offering history
//    (`choice`: the student may swap them). Re-audited until the rows are covered.
// 2. Electives: rows that count units or courses without naming them (total units, upper
//    division, breadth, W/Q...) become placeholder electives, 3 units each (policy
//    unknown_course units, ASSUMPTION). Most specific rows first; an elective counts toward
//    every row it fits, so it isn't planned twice.
// 3. Terms, from the start term: a co-op work term is planned empty. Summer is a study term
//    only if the student chose summer (the start term is always planned). Each study term
//    takes named courses in order while the validator finds no blocking problem for them
//    (prerequisites, corequisites, offered that season, entry GPA), then electives up to
//    the course load. It stops when everything is planned, or when a named course can't be
//    placed for a year with no electives left (reported as unscheduled).

/** Summer study terms: a full load, up to two courses, or none. */
export type SummerChoice = "full" | "some" | "none";

export type RemainingOptions = {
  /** The first term of the plan, always planned (e.g. "2027-spring"). */
  startTerm: string;
  /** Courses per study term (summer "some" caps it at 2). */
  courseLoad: number;
  summer: SummerChoice;
  /** Co-op work terms: planned empty. Consecutive work terms are allowed. */
  coopTerms: string[];
  /** Safety cap on the number of terms (default 24). */
  maxTerms?: number;
};

/** What a placeholder elective must be, read from the requirement rows it is for. */
export type ElectiveSlot = {
  /** "400": BUS 400-499; "upper": 300-499; "lower": 100-299; null: any level. */
  level: "lower" | "upper" | "400" | null;
  /** true: a BUS course; false: outside BUS; null: either. */
  business: boolean | null;
  /** W, Q, B-Soc, B-Hum or B-Sci, or null. */
  designation: string | null;
  /** A row whose course list the course must come from, or null. */
  fromList: string | null;
};

export type PlanItem =
  | {
      kind: "course";
      code: string;
      /** Requirement rows this course is planned for. */
      reqIds: string[];
      /** One option picked from a list; the student may swap it for another. */
      choice: boolean;
    }
  | { kind: "elective"; slot: ElectiveSlot; reqIds: string[] };

export type RemainingTerm = {
  id: string;
  kind: "study" | "coop";
  items: PlanItem[];
};

export type RemainingPlan = {
  terms: RemainingTerm[];
  /** Named courses no term could take, with the validator's reasons. */
  unscheduled: { code: string; reqIds: string[]; reasons: ViolationCode[] }[];
  /** Rows that adding courses can't satisfy (GPA, unknowns), still open after the plan. */
  notPlannable: { reqId: string; status: ReqStatus }[];
  /** The named courses by term, as validated. */
  plan: Plan;
  validation: PlanValidation;
};

const SEASONS = ["spring", "summer", "fall"] as const;
const ordinal = (term: string) => {
  const [year, season] = term.split("-");
  return Number(year) * 3 + SEASONS.indexOf(season as (typeof SEASONS)[number]);
};
const termAt = (n: number) => `${Math.floor(n / 3)}-${SEASONS[n % 3]}`;

/** Violations that stop a course from going in a term. Unknowns and permission don't. */
const BLOCKING: ViolationCode[] = [
  "PREREQ_UNMET",
  "COREQ_UNMET",
  "NOT_OFFERED_RECENTLY",
  "ALREADY_TAKEN",
  "DUPLICATE_IN_PLAN",
];

/**
 * In-progress and planned courses counted as completed with P, to measure what is still
 * open. P meets every minimum and earns units but carries no grade points, so GPA rows
 * are unchanged.
 */
function assumePassed(student: Student, planned: string[], term: string) {
  return {
    ...student,
    courses: [
      ...student.courses.map((c): StudentCourse =>
        c.status === "completed"
          ? c
          : { ...c, status: "completed", grade: "P" },
      ),
      ...planned.map((code): StudentCourse => ({
        code,
        grade: "P",
        term,
        institution: "SFU",
        status: "completed",
      })),
    ],
  };
}

function applies(row: RequirementRow, student: Student): boolean {
  return (
    row.status !== "out-of-scope" &&
    (row.concentration === null ||
      student.declaredConcentrations.includes(row.concentration))
  );
}

// ---------- 1. named courses ----------

type Named = { code: string; reqIds: string[]; choice: boolean };

function selectNamed(
  student: Student,
  catalog: PlanCatalog,
  startTerm: string,
): Named[] {
  const policy = catalog.policy;
  const rowsById = new Map(catalog.requirements.map((r) => [r.req_id, r]));
  const rows = catalog.requirements.filter(
    (r) => applies(r, student) && isSlotRow(r),
  );
  const known = new Set(catalog.courses.map((c) => c.code));
  const offered = (code: string) =>
    Object.keys(catalog.offerings[code] ?? {}).some((k) => k !== "future") ||
    Object.keys(catalog.offerings[code]?.future ?? {}).length > 0;
  const best = new Map<string, string | null>();
  for (const c of student.courses) {
    if (c.status !== "completed") continue;
    const prior = best.get(c.code);
    if (
      prior === undefined ||
      attemptScore(c.grade, policy) < attemptScore(prior, policy)
    )
      best.set(c.code, c.grade);
  }
  const inProgress = new Set(
    student.courses.filter((c) => c.status !== "completed").map((c) => c.code),
  );
  // Already done for this row: passed with its minimum, or in progress (assumed passed).
  const done = (code: string, row: RequirementRow) =>
    inProgress.has(code) ||
    (best.has(code) &&
      meetsMinimum(best.get(code)!, row.min_grade, code, policy));

  const selected: Named[] = [];
  for (let round = 0; round < 4; round++) {
    const result = audit(
      assumePassed(
        student,
        selected.map((s) => s.code),
        startTerm,
      ),
      catalog,
    );
    const byId = new Map(result.results.map((r) => [r.reqId, r]));
    let added = false;
    for (const row of rows) {
      const r = byId.get(row.req_id);
      if (!r || r.status !== "unmet") continue;
      let remaining = r.progress.need - (r.progress.have ?? 0);
      const list = rowCourseList(row, rowsById) ?? [];
      const choice = list.length > 1;
      // Options with course data and offering history first; list order otherwise.
      const options = choice
        ? [
            ...list.filter((c) => known.has(c) && offered(c)),
            ...list.filter((c) => !(known.has(c) && offered(c))),
          ]
        : list;
      for (const code of options) {
        if (remaining <= 0) break;
        if (r.usedCourses.includes(code) || done(code, row)) continue;
        const already = selected.find((s) => s.code === code);
        if (already) {
          // Planned for another row: it may count here too (the next audit decides).
          if (round === 0 && !already.reqIds.includes(row.req_id)) {
            already.reqIds.push(row.req_id);
            remaining--;
          }
          continue;
        }
        selected.push({ code, reqIds: [row.req_id], choice });
        remaining--;
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}

// ---------- 2. electives ----------

function slotOf(row: RequirementRow): ElectiveSlot {
  const f = row.filter;
  const business =
    f.includes("dept BUS") ||
    f.includes("subject business") ||
    f.includes("subject in major")
      ? true
      : f.some((t) => t.startsWith("dept not in")) ||
          f.includes("outside Beedie") ||
          f.includes("subject outside major")
        ? false
        : null;
  const level =
    row.level_min !== null && row.level_min >= 400
      ? "400"
      : row.level_min !== null && row.level_min >= 300
        ? "upper"
        : row.level_max !== null && row.level_max <= 299
          ? "lower"
          : null;
  const listed =
    row.courses.length > 0 || f.some((t) => t.startsWith("from_reqs "));
  return {
    level,
    business,
    designation: row.designation[0] ?? null,
    fromList: listed ? row.req_id : null,
  };
}

const RANGE = {
  "400": [400, 499],
  upper: [300, 499],
  lower: [100, 299],
  any: [100, 499],
} as const;

/** Would a course of this kind count toward the row? */
function fits(slot: ElectiveSlot, row: RequirementRow): boolean {
  const [min, max] = RANGE[slot.level ?? "any"];
  if (row.level_min !== null && min < row.level_min) return false;
  if (row.level_max !== null && max > row.level_max) return false;
  const want = slotOf(row);
  if (want.business !== null && slot.business !== want.business) return false;
  if (
    row.designation.length > 0 &&
    !(row.designation as string[]).includes(slot.designation ?? "")
  )
    return false;
  if (
    row.filter.includes("not allocated to designated breadth") &&
    slot.designation?.startsWith("B-")
  )
    return false;
  if (want.fromList !== null) {
    const lists = [
      row.req_id,
      ...row.filter.flatMap(
        (t) => /^from_reqs (.+)$/.exec(t)?.[1]?.split("|") ?? [],
      ),
    ];
    if (slot.fromList === null || !lists.includes(slot.fromList)) return false;
  }
  return true;
}

const COUNTED = ["units from", "n courses"];

function electivesFor(
  rows: RequirementRow[],
  after: AuditResult,
  units: number,
): { slot: ElectiveSlot; reqIds: string[] }[] {
  const byId = new Map(after.results.map((r) => [r.reqId, r]));
  const open = rows.filter(
    (r) =>
      COUNTED.includes(r.rule) &&
      !isSlotRow(r) &&
      byId.get(r.req_id)?.status === "unmet",
  );
  const score = (r: RequirementRow) => {
    const s = slotOf(r);
    return (
      (s.fromList ? 8 : 0) +
      (s.designation ? 4 : 0) +
      (s.level === "400" ? 3 : s.level ? 2 : 0) +
      (s.business !== null ? 1 : 0)
    );
  };
  const ordered = [...open].sort((a, b) => score(b) - score(a)); // stable: sheet order
  const slots: ElectiveSlot[] = [];
  for (const row of ordered) {
    const r = byId.get(row.req_id)!;
    const credit = slots.filter((s) => fits(s, row)).length;
    const short = r.progress.need - (r.progress.have ?? 0);
    const more =
      row.rule === "units from"
        ? Math.ceil(Math.max(short - credit * units, 0) / units)
        : Math.max(short - credit, 0);
    for (let i = 0; i < more; i++) slots.push(slotOf(row));
  }
  return slots.map((slot) => ({
    slot,
    reqIds: open.filter((r) => fits(slot, r)).map((r) => r.req_id),
  }));
}

// ---------- 3. terms ----------

export function planRemaining(
  student: Student,
  catalog: PlanCatalog,
  options: RemainingOptions,
  declarations: Declarations = {},
): RemainingPlan {
  const { startTerm, courseLoad, summer } = options;
  const maxTerms = options.maxTerms ?? 24;
  const coop = new Set(options.coopTerms);
  const lastCoop = Math.max(-Infinity, ...[...coop].map(ordinal));
  const elective = catalog.policy.unknown_course.units;

  let named = selectNamed(student, catalog, startTerm);
  const after = audit(
    assumePassed(
      student,
      named.map((n) => n.code),
      startTerm,
    ),
    catalog,
  );
  const rows = catalog.requirements.filter((r) => applies(r, student));
  let electives = electivesFor(rows, after, elective);

  const currentAudit = audit(student, catalog);
  const terms: RemainingTerm[] = [];
  const planned: PlanTerm[] = [];
  const reasons = new Map<string, ViolationCode[]>();
  let stuck = 0;

  for (
    let n = ordinal(startTerm);
    terms.length < maxTerms && n < ordinal(startTerm) + maxTerms * 3;
    n++
  ) {
    const id = termAt(n);
    if (coop.has(id)) {
      terms.push({ id, kind: "coop", items: [] });
      planned.push({ id, kind: "coop", courses: [] });
      continue;
    }
    if (named.length === 0 && electives.length === 0) {
      if (n > lastCoop) break;
      continue; // nothing left to study before the last work term
    }
    const season = id.split("-")[1];
    if (season === "summer" && summer === "none" && n !== ordinal(startTerm))
      continue;
    const load =
      season === "summer" && summer === "some"
        ? Math.min(2, courseLoad)
        : courseLoad;

    const items: PlanItem[] = [];
    const codes: string[] = [];
    for (const pick of named) {
      if (codes.length >= load) break;
      const trial: Plan = {
        terms: [
          ...planned,
          { id, kind: "study", courses: [...codes, pick.code] },
        ],
      };
      const v = validatePlan(student, trial, catalog, declarations, {
        graduation: false,
        currentAudit,
      });
      const blocking = v.violations.filter(
        (x) =>
          x.termId === id &&
          x.courseCode === pick.code &&
          (BLOCKING.includes(x.code) ||
            (x.code === "ENTRY_GPA" && x.severity === "error")),
      );
      if (blocking.length === 0) {
        codes.push(pick.code);
        items.push({ kind: "course", ...pick });
      } else reasons.set(pick.code, [...new Set(blocking.map((x) => x.code))]);
    }
    named = named.filter((p) => !codes.includes(p.code));
    while (items.length < load && electives.length > 0) {
      items.push({ kind: "elective", ...electives[0]! });
      electives = electives.slice(1);
    }
    stuck = codes.length === 0 && named.length > 0 ? stuck + 1 : 0;
    // Nothing fits this term (e.g. waiting for a course's season): leave it out.
    if (items.length > 0) {
      terms.push({ id, kind: "study", items });
      planned.push({ id, kind: "study", courses: codes });
    }
    // A year of terms without placing a named course, and no electives left: stop.
    if (stuck >= 3 && electives.length === 0 && n >= lastCoop) break;
  }

  const plan: Plan = { terms: planned };
  const validation = validatePlan(student, plan, catalog, declarations, {
    currentAudit,
  });
  const unscheduled = named.map((p) => ({
    code: p.code,
    reqIds: p.reqIds,
    reasons: reasons.get(p.code) ?? [],
  }));
  const covered = new Set([
    ...terms.flatMap((t) =>
      t.items.flatMap((i) => (i.kind === "elective" ? i.reqIds : [])),
    ),
    ...unscheduled.flatMap((u) => u.reqIds),
  ]);
  const notPlannable = validation.auditAfterPlan.results
    .filter(
      (r) =>
        (r.status === "unmet" || r.status === "unknown") &&
        !covered.has(r.reqId),
    )
    .map((r) => ({ reqId: r.reqId, status: r.status }));
  return { terms, unscheduled, notPlannable, plan, validation };
}
