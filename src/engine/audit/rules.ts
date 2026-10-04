import type { RequirementRow } from "@/lib/data/schema";
import type { CourseFact, GpaAttempt } from "./courses";
import {
  eligibility,
  ownEligibility,
  rowCourseList,
  withinParent,
  type EligibilityContext,
} from "./eligibility";
import { meetsMinimum } from "./grades";
import { hopcroftKarp } from "./matching";
import type { ProgressUnit } from "./types";

// Rule evaluators for one tier of courses. See docs/engine-spec.md sections 3 and 4.

export type RowEval = {
  met: boolean;
  /** Reasons the row could be met with data we don't have (empty if none). */
  maybe: string[];
  have: number | null;
  need: number;
  unit: ProgressUnit;
  used: string[];
  missing: string[];
  notes: string[];
  /** Row-level unknown (e.g. GPA over undefined "program courses"). */
  unknownReason?: string;
};

const evalOf = (
  partial: Partial<RowEval> & Pick<RowEval, "have" | "need" | "unit">,
): RowEval => ({
  met: false,
  maybe: [],
  used: [],
  missing: [],
  notes: [],
  ...partial,
});

const sorted = (codes: Iterable<string>) => [...new Set(codes)].sort();

// ---------- kinds ----------

export function isSlotRow(row: RequirementRow): boolean {
  return (
    row.rule === "one course" ||
    row.rule === "all of" ||
    (row.rule === "n courses" && row.courses.length > 0)
  );
}

export function breadthBucket(row: RequirementRow): string | null {
  if (row.rule !== "units from" && row.rule !== "n courses") return null;
  if (!row.filter.includes("subject outside major")) return null;
  if (row.filter.includes("not allocated to designated breadth"))
    return "additional";
  const d = row.designation;
  if (d.length === 1 && d[0]!.startsWith("B-")) return d[0]!;
  return null;
}

export function slotNeed(row: RequirementRow): number {
  if (row.rule === "one course") return 1;
  if (row.rule === "all of") return row.courses.length;
  return row.n_or_units ?? 0;
}

// ---------- slot pools (Hopcroft-Karp) ----------

type Slot = { rowId: string; ownerId: string };

/**
 * Fills the slot rows of one pool with a maximum matching. A `within` child gets its own
 * slots (eligible = child and parent); the parent keeps n_parent - sum(n_child) slots, and
 * its used courses include its children's.
 */
export function solvePool(
  rows: RequirementRow[],
  facts: CourseFact[],
  ctx: EligibilityContext,
): Map<string, RowEval> {
  const ids = new Set(rows.map((r) => r.req_id));
  const childrenOf = new Map<string, RequirementRow[]>();
  for (const row of rows) {
    const parent = withinParent(row);
    if (parent && ids.has(parent))
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), row]);
  }

  const slots: Slot[] = [];
  const notes = new Map<string, string[]>();
  for (const row of rows) {
    const parent = withinParent(row);
    if (parent && ids.has(parent)) continue; // added with its parent
    const children = childrenOf.get(row.req_id) ?? [];
    for (const child of children) {
      for (let i = 0; i < slotNeed(child); i++)
        slots.push({ rowId: child.req_id, ownerId: row.req_id });
    }
    const own = slotNeed(row) - children.reduce((n, c) => n + slotNeed(c), 0);
    if (own < 0)
      notes.set(row.req_id, [
        "Subset rows need more courses than this row; check the data.",
      ]);
    for (let i = 0; i < Math.max(own, 0); i++)
      slots.push({ rowId: row.req_id, ownerId: row.req_id });
  }

  const rowById = new Map(rows.map((r) => [r.req_id, r]));
  const elig = slots.map((slot) =>
    facts.map((f) => eligibility(rowById.get(slot.rowId)!, f, ctx)),
  );
  const definite = elig.map((row) =>
    row.flatMap((e, i) => (e.kind === "yes" ? [i] : [])),
  );
  const m = hopcroftKarp(definite, facts.length);
  // "Could this row be met?": only this row's slots may use courses of unknown eligibility.
  const looseFor = (mine: number[]) =>
    hopcroftKarp(
      elig.map((row, l) =>
        row.flatMap((e, i) =>
          e.kind === "yes" || (mine.includes(l) && e.kind === "maybe")
            ? [i]
            : [],
        ),
      ),
      facts.length,
    );

  const result = new Map<string, RowEval>();
  for (const row of rows) {
    const mine = slots.flatMap((s, i) =>
      s.rowId === row.req_id || s.ownerId === row.req_id ? [i] : [],
    );
    const filled = mine.filter((i) => m.matchLeft[i] !== -1);
    const used = sorted(filled.map((i) => facts[m.matchLeft[i]!]!.code));
    const met = mine.length > 0 && filled.length === mine.length;
    const rowNotes = [...(notes.get(row.req_id) ?? [])];

    const maybe: string[] = [];
    const mm = met ? null : looseFor(mine);
    if (mm && mine.every((i) => mm.matchLeft[i] !== -1)) {
      for (const i of mine) {
        const e = elig[i]![mm.matchLeft[i]!]!;
        if (e.kind === "maybe") maybe.push(e.reason);
      }
    }

    let missing: string[] = [];
    if (!met) {
      const list = rowCourseList(row, ctx.rowsById) ?? [];
      const taken = new Set(facts.map((f) => f.code));
      missing = list.filter((c) => !taken.has(c));
      // An eligible course matched to another row of this pool: say so.
      for (const [r, f] of facts.entries()) {
        const owner = m.matchRight[r]!;
        if (owner === -1 || mine.includes(owner)) continue;
        if (eligibility(row, f, ctx).kind === "yes") {
          rowNotes.push(
            `${f.code} is eligible but is used for ${slots[owner]!.rowId}.`,
          );
        }
      }
    }
    result.set(
      row.req_id,
      evalOf({
        met,
        maybe,
        have: filled.length,
        need: slotNeed(row),
        unit: "courses",
        used,
        missing,
        notes: rowNotes,
      }),
    );
  }
  return result;
}

// ---------- breadth buckets ----------

/**
 * Allocates outside-major courses to breadth buckets (B-Soc, B-Hum, B-Sci, additional) so
 * each course sits in at most one bucket (I2). Each bucket starts with its course-count
 * slots; a bucket with enough courses but too few units gets one more slot while eligible
 * courses remain unallocated. Each round is a fresh maximum matching.
 */
export function solveBreadth(
  rows: RequirementRow[],
  facts: CourseFact[],
  ctx: EligibilityContext,
): Map<string, RowEval> {
  const buckets: {
    key: string;
    rows: RequirementRow[];
    units: number;
    count: number;
  }[] = [];
  for (const row of rows) {
    const key = breadthBucket(row)!;
    let bucket = buckets.find((b) => b.key === key);
    if (!bucket) buckets.push((bucket = { key, rows: [], units: 0, count: 0 }));
    bucket.rows.push(row);
    if (row.rule === "units from") bucket.units = row.n_or_units ?? 0;
    else bucket.count = row.n_or_units ?? 0;
  }
  const usable = facts.filter((f) => f.earns);
  const eligOf = buckets.map((b) =>
    usable.map((f) => eligibility(b.rows[0]!, f, ctx)),
  );
  const slotsPer = buckets.map((b) => Math.max(b.count, 1));

  // `maybeFor`: the one bucket allowed to use courses whose eligibility is unknown (to ask
  // "could this bucket be met?"); every other bucket uses definite courses only.
  const usableEdge =
    (b: number, maybeFor: number | null) => (e: { kind: string }) =>
      e.kind === "yes" || (maybeFor === b && e.kind === "maybe");
  const solve = (maybeFor: number | null) => {
    const counts = [...slotsPer];
    for (;;) {
      const owner: number[] = [];
      const adjacency: number[][] = [];
      buckets.forEach((_, b) => {
        const ok = usableEdge(b, maybeFor);
        for (let k = 0; k < counts[b]!; k++) {
          owner.push(b);
          adjacency.push(eligOf[b]!.flatMap((e, i) => (ok(e) ? [i] : [])));
        }
      });
      const m = hopcroftKarp(adjacency, usable.length);
      const got = buckets.map((_, b) =>
        adjacency.flatMap((_, l) =>
          owner[l] === b && m.matchLeft[l] !== -1 ? [m.matchLeft[l]!] : [],
        ),
      );
      let grew = false;
      buckets.forEach((bucket, b) => {
        const units = got[b]!.reduce((n, i) => n + (usable[i]!.units ?? 0), 0);
        const ok = usableEdge(b, maybeFor);
        const free = eligOf[b]!.some((e, i) => ok(e) && m.matchRight[i] === -1);
        if (got[b]!.length >= counts[b]! && units < bucket.units && free) {
          counts[b]!++;
          grew = true;
        }
      });
      if (!grew) return got;
    }
  };

  const definite = solve(null);
  const loose = buckets.map((_, b) => solve(b)[b]!);
  const result = new Map<string, RowEval>();
  buckets.forEach((bucket, b) => {
    const chosen = definite[b]!.map((i) => usable[i]!);
    const used = sorted(chosen.map((f) => f.code));
    const unknownUnits = chosen
      .filter((f) => f.units === null)
      .map((f) => `no course data for ${f.code}: units unknown`);
    const units = chosen.reduce((n, f) => n + (f.units ?? 0), 0);
    for (const row of bucket.rows) {
      const isUnits = row.rule === "units from";
      const have = isUnits ? units : chosen.length;
      const need = row.n_or_units ?? 0;
      const met = have >= need && (!isUnits || unknownUnits.length === 0);
      const maybe: string[] = [];
      if (!met) {
        const alt = loose[b]!.map((i: number) => usable[i]!);
        const altHave = isUnits
          ? alt.reduce((n, f) => n + (f.units ?? 0), 0)
          : alt.length;
        const reasons = alt.flatMap((f) => {
          const e = eligOf[b]![usable.indexOf(f)]!;
          return e.kind === "maybe" ? [e.reason] : [];
        });
        if ((altHave >= need && reasons.length > 0) || unknownUnits.length > 0)
          maybe.push(...reasons, ...unknownUnits);
      }
      result.set(
        row.req_id,
        evalOf({
          met,
          maybe,
          have,
          need,
          unit: isUnits ? "units" : "courses",
          used,
        }),
      );
    }
  });
  return result;
}

// ---------- overlays ----------

/** `units from` and filter-only `n courses`: read the pool, consume nothing. */
export function evaluateOverlay(
  row: RequirementRow,
  facts: CourseFact[],
  ctx: EligibilityContext,
): RowEval {
  const isUnits = row.rule === "units from";
  const need = row.n_or_units ?? 0;
  const yes: CourseFact[] = [];
  const maybeReasons: string[] = [];
  let maybeHave = 0;
  for (const f of facts) {
    if (!f.earns) continue;
    const e = eligibility(row, f, ctx);
    if (e.kind === "yes") {
      if (isUnits && f.units === null) {
        maybeReasons.push(`no course data for ${f.code}: units unknown`);
        maybeHave += Infinity;
      } else yes.push(f);
    } else if (e.kind === "maybe") {
      maybeReasons.push(e.reason);
      maybeHave += isUnits ? (f.units ?? Infinity) : 1;
    }
  }
  const have = isUnits ? yes.reduce((n, f) => n + f.units!, 0) : yes.length;
  const met = have >= need;
  return evalOf({
    met,
    maybe: !met && have + maybeHave >= need ? maybeReasons : [],
    have,
    need,
    unit: isUnits ? "units" : "courses",
    used: sorted(yes.map((f) => f.code)),
    missing: met
      ? []
      : [
          `${isUnits ? need - have : need - have} more ${isUnits ? "units" : "courses"}`,
        ],
  });
}

/**
 * `minimum GPA` over graded attempts passing the row's filters (grade check skipped).
 * `programCourses`: codes matched to Lower core, Upper core and declared-concentration slot
 * rows (BUS only), used by rows with the `program courses` filter. ASSUMPTION (Stuart,
 * 2026-10-04): not yet confirmed against the calendar.
 */
export function evaluateGpa(
  row: RequirementRow,
  attempts: GpaAttempt[],
  ctx: EligibilityContext,
  programCourses: ReadonlySet<string> = new Set(),
): RowEval & { gpa: number | null } {
  const need = row.n_or_units ?? 0;
  const programOnly = row.filter.includes("program courses");
  const counted: GpaAttempt[] = [];
  for (const a of attempts) {
    if (a.institution !== "SFU") continue; // SFU GPA; transfer credit carries no SFU grade points
    if (programOnly && (a.dept !== "BUS" || !programCourses.has(a.code)))
      continue;
    const fact: CourseFact = {
      code: a.code,
      dept: a.dept,
      number: a.number,
      level: Math.floor(a.number / 100) * 100,
      units: a.units,
      designations: null,
      grade: null,
      institution: a.institution,
      pending: true, // skip the grade check: every letter grade counts toward GPA
      earns: true,
    };
    if (ownEligibility(row, fact, ctx).kind === "yes") counted.push(a);
  }
  const missingUnits = counted.filter((a) => a.units === null);
  if (missingUnits.length > 0) {
    const reason = `units unknown for ${missingUnits.map((a) => a.code).join(", ")}`;
    return {
      ...evalOf({ have: null, need, unit: "gpa", unknownReason: reason }),
      gpa: null,
    };
  }
  const units = counted.reduce((n, a) => n + a.units!, 0);
  if (units === 0) {
    return {
      ...evalOf({
        have: null,
        need,
        unit: "gpa",
        unknownReason: "no graded courses yet",
      }),
      gpa: null,
    };
  }
  const gpa = counted.reduce((n, a) => n + a.points * a.units!, 0) / units;
  const shown = Math.round(gpa * 100) / 100;
  return {
    ...evalOf({
      met: gpa >= need,
      have: shown,
      need,
      unit: "gpa",
      used: counted.map((a) => a.code),
    }),
    gpa: shown,
  };
}

/**
 * `minimum grade`.
 * - With `group X|Y`: completed courses named by those groups' rows whose grade is below
 *   the minimum are violations; met when there are none.
 * - With a designation (univ-wqb-grade): informational. Courses below the minimum earn no
 *   W/Q/B credit; they are listed in notes, the row stays met.
 */
export function evaluateMinimumGrade(
  row: RequirementRow,
  facts: CourseFact[],
  allRows: RequirementRow[],
  ctx: EligibilityContext,
): RowEval {
  const groups = row.filter.flatMap(
    (t) => /^group (.+)$/.exec(t)?.[1]?.split("|") ?? [],
  );
  const completed = facts.filter((f) => !f.pending && f.grade !== null);
  if (groups.length > 0) {
    const listed = new Set(
      allRows.filter((r) => groups.includes(r.group)).flatMap((r) => r.courses),
    );
    const violations = completed.filter(
      (f) =>
        listed.has(f.code) &&
        !meetsMinimum(f.grade, row.min_grade, f.code, ctx.policy),
    );
    return evalOf({
      met: violations.length === 0,
      have: violations.length,
      need: 0,
      unit: "violations",
      used: sorted(violations.map((f) => f.code)),
      notes: violations.map(
        (f) => `${f.code} (${f.grade}) is below ${row.min_grade}.`,
      ),
    });
  }
  const below = completed.filter(
    (f) =>
      f.designations !== null &&
      f.designations.some((d) => (row.designation as string[]).includes(d)) &&
      !meetsMinimum(f.grade, row.min_grade, f.code, ctx.policy),
  );
  return evalOf({
    met: true,
    have: below.length,
    need: 0,
    unit: "violations",
    notes: below.map(
      (f) =>
        `${f.code} (${f.grade}) earns no W/Q/B credit (below ${row.min_grade}).`,
    ),
  });
}
