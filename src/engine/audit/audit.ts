import type { RequirementRow } from "@/lib/data/schema";
import { buildFacts, gpaAttempts, type CourseFact } from "./courses";
import type { EligibilityContext } from "./eligibility";
import {
  breadthBucket,
  evaluateGpa,
  evaluateMinimumGrade,
  evaluateOverlay,
  isSlotRow,
  solveBreadth,
  solvePool,
  type RowEval,
} from "./rules";
import type {
  AuditOptions,
  AuditResult,
  Catalog,
  ReqResult,
  ReqStatus,
  Student,
} from "./types";

// The degree audit: evaluates every requirement row for a student. Pure: data in,
// result out. See docs/engine-spec.md.

const TERM_ORDER = ["spring", "summer", "fall"];
function termOrdinal(term: string): number {
  const [year, name] = term.split("-");
  return Number(year) * 3 + TERM_ORDER.indexOf(name ?? "");
}

/** Rows the audit skips for this student, with the reason. */
function notApplicable(row: RequirementRow, student: Student): string | null {
  if (row.status === "out-of-scope")
    return "Out of scope for this app (row status out-of-scope).";
  if (
    row.concentration !== null &&
    !student.declaredConcentrations.includes(row.concentration)
  ) {
    return `Concentration ${row.concentration} is not declared.`;
  }
  return null;
}

/** BUS 203/300/496 rows for students admitted before 2022-fall (policy). */
function admissionGate(
  row: RequirementRow,
  student: Student,
  catalog: Catalog,
): string | null {
  const gate = catalog.policy.admission_gated_courses;
  if (
    row.courses.length === 0 ||
    !row.courses.every((c) => gate.courses.includes(c))
  )
    return null;
  return termOrdinal(student.admissionTerm) < termOrdinal(gate.from_term)
    ? "different requirement set for this admission term"
    : null;
}

/** Evaluates every applicable row on one tier of courses. */
function evaluateTier(
  student: Student,
  catalog: Catalog,
  facts: Map<string, CourseFact>,
  applicable: RequirementRow[],
): Map<string, RowEval> {
  const list = [...facts.values()];
  const rowsById = new Map(catalog.requirements.map((r) => [r.req_id, r]));
  const earnedUnits = list
    .filter((f) => f.earns)
    .reduce((n, f) => n + (f.units ?? 0), 0);
  const ctx: EligibilityContext = {
    policy: catalog.policy,
    rowsById,
    earnedUnits,
  };
  const evals = new Map<string, RowEval>();

  // Slot pools: core, then one per declared concentration.
  const slotRows = applicable.filter(isSlotRow);
  const pools = [
    slotRows.filter(
      (r) =>
        r.concentration === null &&
        (r.group === "Lower core" || r.group === "Upper core"),
    ),
    ...student.declaredConcentrations.map((c) =>
      slotRows.filter((r) => r.concentration === c),
    ),
  ];
  for (const pool of pools) {
    for (const [id, e] of solvePool(pool, list, ctx)) evals.set(id, e);
  }
  // Slot rows outside these pools (none today) are solved on their own.
  for (const row of slotRows) {
    if (!evals.has(row.req_id))
      for (const [id, e] of solvePool([row], list, ctx)) evals.set(id, e);
  }

  // Shared courses across pools: allowed (OPEN-1, OPEN-2), listed in each row's notes.
  const usedBy = new Map<string, string[]>();
  for (const row of slotRows) {
    for (const code of evals.get(row.req_id)!.used)
      usedBy.set(code, [...(usedBy.get(code) ?? []), row.req_id]);
  }
  for (const [code, ids] of usedBy) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const others = ids.filter((x) => x !== id).join(", ");
      evals
        .get(id)!
        .notes.push(
          `${code} also counts toward ${others} (OPEN: double counting to be confirmed with an advisor).`,
        );
    }
  }

  const breadthRows = applicable.filter((r) => breadthBucket(r) !== null);
  for (const [id, e] of solveBreadth(breadthRows, list, ctx)) evals.set(id, e);

  // Program courses (ASSUMPTION, Stuart 2026-10-04): BUS courses matched to Lower core, Upper
  // core and declared-concentration slot rows; a course used by two rows is one entry.
  const programCourses = new Set<string>();
  for (const row of slotRows) {
    const inProgram =
      row.group === "Lower core" ||
      row.group === "Upper core" ||
      (row.group === "Concentration" &&
        row.concentration !== null &&
        student.declaredConcentrations.includes(row.concentration));
    if (!inProgram) continue;
    for (const code of evals.get(row.req_id)!.used)
      if (code.startsWith("BUS ")) programCourses.add(code);
  }

  const attempts = gpaAttempts(student, catalog);
  for (const row of applicable) {
    if (evals.has(row.req_id)) continue;
    switch (row.rule) {
      case "units from":
      case "n courses":
        evals.set(row.req_id, evaluateOverlay(row, list, ctx));
        break;
      case "minimum GPA":
        evals.set(row.req_id, evaluateGpa(row, attempts, ctx, programCourses));
        break;
      case "minimum grade":
        evals.set(row.req_id, evaluateMinimumGrade(row, list, applicable, ctx));
        break;
      case "maximum breadth allocations per course":
        evals.set(row.req_id, {
          met: true,
          maybe: [],
          have: 0,
          need: 0,
          unit: "violations",
          used: [],
          missing: [],
          notes: [
            "Enforced by the breadth allocation: each course is in at most one breadth bucket.",
          ],
        });
        break;
    }
  }

  // Completed concentrations: every applicable row of the concentration is met.
  for (const row of applicable.filter(
    (r) => r.rule === "completed concentrations",
  )) {
    const done = student.declaredConcentrations.filter((c) => {
      const rows = applicable.filter((r) => r.concentration === c);
      return rows.length > 0 && rows.every((r) => evals.get(r.req_id)?.met);
    });
    const need = row.n_or_units ?? 0;
    evals.set(row.req_id, {
      met: done.length >= need,
      maybe: [],
      have: done.length,
      need,
      unit: "concentrations",
      used: done,
      missing:
        student.declaredConcentrations.length === 0
          ? ["No concentration declared."]
          : [],
      notes: [],
    });
  }
  return evals;
}

function rowNotes(
  row: RequirementRow,
  used: string[],
  facts: Map<string, CourseFact>,
  catalog: Catalog,
): string[] {
  const notes: string[] = [];
  if (row.notes)
    notes.push(`Calendar note (not checked by the engine): ${row.notes}`);
  if (row.concentration !== null && row.min_grade === null) {
    notes.push(
      "ASSUMPTION: any passing grade counts here; C- may apply if the course is also a prerequisite.",
    );
  }
  const purpose = row.filter.find((t) => t.startsWith("purpose "));
  if (purpose) notes.push(`GPA ${purpose}.`);
  if (row.filter.includes("program courses")) {
    notes.push(
      "ASSUMPTION: program courses = BUS courses used by Lower core, Upper core and declared-concentration rows (rule decided by Stuart, not yet confirmed against the calendar).",
    );
  }
  for (const code of used) {
    if (facts.get(code)?.grade === catalog.policy.transfer_credit.grade) {
      notes.push(
        `${code}: transfer credit (CR), grade not known; assumed to meet the minimum grade.`,
      );
    }
  }
  return notes;
}

export function audit(
  student: Student,
  catalog: Catalog,
  options: AuditOptions = {},
): AuditResult {
  const completedFacts = buildFacts(student, catalog, "completed");
  const pendingFacts = buildFacts(
    student,
    catalog,
    "pending",
    options.includePlanned,
  );

  const skip = new Map<string, string>();
  for (const row of catalog.requirements) {
    const reason = notApplicable(row, student);
    if (reason) skip.set(row.req_id, reason);
  }
  const applicable = catalog.requirements.filter((r) => !skip.has(r.req_id));
  const t1 = evaluateTier(student, catalog, completedFacts, applicable);
  const t2 = evaluateTier(student, catalog, pendingFacts, applicable);

  const results: ReqResult[] = [];
  const unknowns: AuditResult["unknowns"] = [];
  const gpas: Record<string, number | null> = {};

  for (const row of catalog.requirements) {
    const base = {
      reqId: row.req_id,
      sourceUrl: row.source_url,
      dataStatus: row.status,
    };
    const skipped = skip.get(row.req_id);
    if (skipped) {
      results.push({
        ...base,
        status: "not_applicable",
        progress: { have: 0, need: row.n_or_units ?? 0, unit: "courses" },
        usedCourses: [],
        missing: [],
        notes: [skipped],
      });
      continue;
    }
    const a = t1.get(row.req_id)!;
    const b = t2.get(row.req_id)!;
    const notes = [
      ...a.notes,
      ...rowNotes(row, a.used, completedFacts, catalog),
    ];
    for (const n of b.notes) if (!notes.includes(n)) notes.push(n);

    let status: ReqStatus;
    let reason: string | undefined;
    const gate = admissionGate(row, student, catalog);
    if (gate) {
      status = "unknown";
      reason = gate;
    } else if (a.unknownReason) {
      status = "unknown";
      reason = a.unknownReason;
    } else if (a.met) status = "met";
    else if (b.met) status = "in_progress";
    else if (b.maybe.length > 0 || a.maybe.length > 0) {
      status = "unknown";
      reason = [...new Set([...a.maybe, ...b.maybe])].join("; ");
    } else status = "unmet";

    if (!a.met && b.have !== a.have && b.have !== null) {
      notes.push(
        `Including in-progress courses: ${b.have} of ${b.need} ${a.unit}.`,
      );
    }
    if (reason) {
      notes.push(`Unknown: ${reason}`);
      unknowns.push({ reqId: row.req_id, reason });
    }
    if (row.rule === "minimum GPA") gpas[row.req_id] = a.have;

    results.push({
      ...base,
      status,
      progress: { have: a.have, need: a.need, unit: a.unit },
      usedCourses: a.used,
      missing: status === "met" ? [] : a.missing.slice(0, 15),
      notes,
    });
  }

  const byStatus: Record<ReqStatus, number> = {
    met: 0,
    unmet: 0,
    in_progress: 0,
    unknown: 0,
    not_applicable: 0,
  };
  for (const r of results) byStatus[r.status]++;
  const earnedUnits = [...completedFacts.values()]
    .filter((f) => f.earns)
    .reduce((n, f) => n + (f.units ?? 0), 0);
  const inProgressUnits = [...pendingFacts.values()]
    .filter((f) => f.pending)
    .reduce((n, f) => n + (f.units ?? 0), 0);

  return {
    results,
    summary: {
      byStatus,
      earnedUnits,
      inProgressUnits,
      gpas,
      declaredConcentrations: student.declaredConcentrations,
    },
    unknowns,
  };
}
