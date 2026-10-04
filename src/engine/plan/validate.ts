import type { PrereqRecord } from "@/lib/data/prereqs";
import { audit } from "../audit/audit";
import { attemptScore, earnsUnits, meetsMinimum } from "../audit/grades";
import type { AuditResult, Student, StudentCourse } from "../audit/types";
import {
  evaluateNode,
  type PassedCourse,
  type PrereqContext,
} from "../prereqs/evaluate";
import { checkOffering, confirmedTerms } from "./offerings";
import type {
  Declarations,
  Plan,
  PlanCatalog,
  PlanValidation,
  Violation,
} from "./types";

// Plan validator (docs/validator-spec.md). Pure: data in, result out.

const TERM_ORDER = ["spring", "summer", "fall"];
function termOrdinal(term: string): number {
  const m = /^(\d{4})-(spring|summer|fall)$/.exec(term);
  return m ? Number(m[1]) * 3 + TERM_ORDER.indexOf(m[2]!) : NaN;
}

function parseCode(code: string) {
  const m = /^([A-Z]{2,5}) (\d{3})/.exec(code);
  return { dept: m?.[1] ?? "", number: m ? Number(m[2]) : NaN };
}

/** ASSUMPTION: course pages follow the calendar's URL pattern. */
function courseUrl(code: string): string {
  const [dept, number] = code.toLowerCase().split(" ");
  return `https://www.sfu.ca/students/calendar/2026/fall/courses/${dept}/${number}.html`;
}

export function validatePlan(
  student: Student,
  plan: Plan,
  catalog: PlanCatalog,
  declarations: Declarations = {},
): PlanValidation {
  const policy = catalog.policy;
  const courseData = new Map(catalog.courses.map((c) => [c.code, c]));
  const prereqs = new Map<string, PrereqRecord>(
    catalog.prereqs.map((r) => [r.code, r]),
  );
  const confirmed = confirmedTerms(catalog.offerings);
  const violations: Violation[] = [];
  const add = (
    v: Omit<Violation, "sourceUrl"> & { sourceUrl?: string | null },
  ) => violations.push({ sourceUrl: null, ...v });

  // A course on the record outside the course data is elective credit (policy
  // unknown_course); a planned course without course data stays unknown (NO_COURSE_DATA).
  const unitsOf = (code: string): number | null =>
    courseData.get(code)?.units ??
    student.courses.find((c) => c.code === code && c.units !== undefined)
      ?.units ??
    (!courseData.has(code) && student.courses.some((c) => c.code === code)
      ? policy.unknown_course.units
      : null);

  // ---- history: completed (best attempt) and in progress ----
  const completed = new Map<string, string>();
  const byCode = new Map<string, StudentCourse[]>();
  for (const c of student.courses)
    byCode.set(c.code, [...(byCode.get(c.code) ?? []), c]);
  for (const [code, attempts] of byCode) {
    const done = attempts.filter(
      (a) => a.status === "completed" && a.grade !== null,
    );
    const best = done.sort(
      (a, b) => attemptScore(a.grade, policy) - attemptScore(b.grade, policy),
    )[0];
    if (best) completed.set(code, best.grade!);
  }
  const inProgress = new Set(
    student.courses
      .filter((c) => c.status === "in_progress")
      .map((c) => c.code),
  );

  const passed = new Map<string, PassedCourse>();
  const addPassed = (code: string) => {
    if (!passed.has(code))
      passed.set(code, { code, ...parseCode(code), units: unitsOf(code) });
  };
  for (const [code, grade] of completed)
    if (earnsUnits(grade, policy)) addPassed(code);
  for (const code of inProgress) addPassed(code);
  const earlier = new Set<string>(inProgress);

  const history = student.courses
    .filter((c) => c.status !== "planned")
    .map((c) => termOrdinal(c.term));
  const lastStudentTerm = history.length > 0 ? Math.max(...history) : -Infinity;

  // Entry GPA (beedie-bus-gpa-entry), from completed grades: the same for every plan term.
  const currentAudit = audit(student, catalog);
  const entryRow = currentAudit.results.find(
    (r) => r.reqId === "beedie-bus-gpa-entry",
  );

  // ---- terms ----
  const terms: PlanValidation["terms"] = [];
  const seenInPlan = new Map<string, string>(); // code -> first term id
  let cumulative: number | null = [...passed.values()].reduce<number | null>(
    (n, p) => (n === null || p.units === null ? null : n + p.units),
    0,
  );
  let previous = lastStudentTerm;

  for (const term of plan.terms) {
    const ord = termOrdinal(term.id);
    if (!(ord > previous)) {
      add({
        severity: "error",
        code: "PLAN_TERM_ORDER",
        courseCode: null,
        termId: term.id,
        message: Number.isNaN(ord)
          ? `"${term.id}" is not a term like "2027-spring".`
          : "Plan terms must be in order and after the student's latest term.",
      });
    }
    if (!Number.isNaN(ord)) previous = Math.max(previous, ord);

    if (term.kind === "coop") {
      if (term.courses.length > 0) {
        add({
          severity: "error",
          code: "COURSES_IN_COOP_TERM",
          courseCode: null,
          termId: term.id,
          message: `Co-op term lists courses: ${term.courses.join(", ")}.`,
        });
      }
      terms.push({ id: term.id, units: 0, cumulativeUnits: cumulative });
      continue;
    }

    const sameTerm = new Set(term.courses);
    const ctxFor = (code: string): PrereqContext => ({
      policy,
      completed,
      earlier,
      sameTerm: new Set([...sameTerm].filter((c) => c !== code)),
      passedBefore: [...passed.values()],
      student: {
        program: student.program,
        admissionTerm: student.admissionTerm,
      },
      declarations,
    });

    const seenThisTerm = new Set<string>();
    for (const code of term.courses) {
      // Duplicates and repeats
      if (seenThisTerm.has(code) || seenInPlan.has(code)) {
        add({
          severity: "warning",
          code: "DUPLICATE_IN_PLAN",
          courseCode: code,
          termId: term.id,
          message: `${code} is already planned in ${seenInPlan.get(code) ?? term.id}.`,
        });
      }
      seenThisTerm.add(code);
      const prior = completed.get(code);
      const repeatAllowed =
        prior !== undefined && !meetsMinimum(prior, "C-", code, policy); // ASSUMPTION (OPEN-3)
      if ((prior !== undefined && !repeatAllowed) || inProgress.has(code)) {
        add({
          severity: "warning",
          code: "ALREADY_TAKEN",
          courseCode: code,
          termId: term.id,
          message: inProgress.has(code)
            ? `${code} is in progress.`
            : `${code} is already completed (${prior}).`,
        });
      }

      if (!courseData.has(code)) {
        add({
          severity: "unknown",
          code: "NO_COURSE_DATA",
          courseCode: code,
          termId: term.id,
          message: `No course data for ${code}: prerequisites, offerings and units unknown.`,
        });
        continue;
      }

      // Prerequisites and corequisites
      const record = prereqs.get(code);
      for (const mode of ["prereq", "coreq"] as const) {
        const node = mode === "prereq" ? record?.prereq : record?.coreq;
        if (!node) continue;
        const r = evaluateNode(node, ctxFor(code), mode);
        const detail = [...r.reasons, ...r.notes].join(" ");
        if (r.truth === "unmet") {
          add(
            r.needsPermission
              ? {
                  severity: "warning",
                  code: "PREREQ_NEEDS_PERMISSION",
                  courseCode: code,
                  termId: term.id,
                  sourceUrl: courseUrl(code),
                  message:
                    `${code}: the ${mode === "prereq" ? "prerequisite" : "corequisite"} is not met; it can be waived by permission. ${detail}`.trim(),
                }
              : {
                  severity: "error",
                  code: mode === "prereq" ? "PREREQ_UNMET" : "COREQ_UNMET",
                  courseCode: code,
                  termId: term.id,
                  sourceUrl: courseUrl(code),
                  message:
                    `${code}: ${mode === "prereq" ? "prerequisite" : "corequisite"} not met. ${detail}`.trim(),
                },
          );
        } else if (r.truth === "unknown") {
          add({
            severity: "unknown",
            code: mode === "prereq" ? "PREREQ_UNKNOWN" : "COREQ_UNKNOWN",
            courseCode: code,
            termId: term.id,
            sourceUrl: courseUrl(code),
            message:
              `${code}: cannot verify the ${mode === "prereq" ? "prerequisite" : "corequisite"}, check with an advisor. ${r.reasons.join("; ")}`.trim(),
          });
        }
      }

      // Offerings
      const offered = checkOffering(
        code,
        term.id,
        catalog.offerings,
        confirmed,
      );
      if (offered.result === "future_only") {
        add({
          severity: "warning",
          code: "NOT_OFFERED_FUTURE_ONLY",
          courseCode: code,
          termId: term.id,
          message: `${code} is listed for an upcoming ${term.id.split("-")[1]} term but did not run in ${offered.window.join(", ")}.`,
        });
      } else if (offered.result === "not_recently") {
        add({
          severity: "warning",
          code: "NOT_OFFERED_RECENTLY",
          courseCode: code,
          termId: term.id,
          message: `${code}: not offered in recent history, check the schedule (no section in ${offered.window.join(", ")}).`,
        });
      }

      // Entry GPA for BUS 300-499, except policy entryGpaExempt
      const { dept, number } = parseCode(code);
      if (
        dept === "BUS" &&
        number >= 300 &&
        number <= 499 &&
        !catalog.policy.entryGpaExempt.includes(code) &&
        entryRow
      ) {
        const gpa = entryRow.progress.have;
        if (gpa === null || entryRow.status === "unknown") {
          add({
            severity: "unknown",
            code: "ENTRY_GPA",
            courseCode: code,
            termId: term.id,
            sourceUrl: entryRow.sourceUrl,
            message: `${code}: needs an SFU BUS GPA of ${entryRow.progress.need}; the GPA can't be computed yet.`,
          });
        } else if (gpa < entryRow.progress.need) {
          add({
            severity: "error",
            code: "ENTRY_GPA",
            courseCode: code,
            termId: term.id,
            sourceUrl: entryRow.sourceUrl,
            message: `${code}: needs an SFU BUS GPA of ${entryRow.progress.need}; yours is ${gpa}.`,
          });
        }
      }
    }

    // Load and totals
    const termUnits = term.courses.reduce<number | null>((n, c) => {
      const u = unitsOf(c);
      return n === null || u === null ? null : n + u;
    }, 0);
    const season = term.id.split("-")[1] as "spring" | "summer" | "fall";
    const load = policy.unit_load[season];
    if (termUnits !== null && load) {
      if (termUnits > load.max) {
        add({
          severity: "warning",
          code: "UNIT_LOAD_HIGH",
          courseCode: null,
          termId: term.id,
          message: `${termUnits} units is above the ${load.max}-unit maximum (ASSUMPTION, verify against the calendar).`,
        });
      } else if (termUnits < load.min) {
        add({
          severity: "warning",
          code: "UNIT_LOAD_LOW",
          courseCode: null,
          termId: term.id,
          message: `${termUnits} units is below the ${load.min}-unit minimum (ASSUMPTION, verify against the calendar).`,
        });
      }
    }
    for (const code of term.courses) {
      if (!seenInPlan.has(code)) seenInPlan.set(code, term.id);
      if (!passed.has(code)) {
        addPassed(code);
        const u = passed.get(code)!.units;
        cumulative = cumulative === null || u === null ? null : cumulative + u;
      }
      earlier.add(code);
    }
    terms.push({ id: term.id, units: termUnits, cumulativeUnits: cumulative });
  }

  // ---- graduation: audit with plan courses as planned, term by term ----
  const plannedThrough = (index: number): Student => ({
    ...student,
    courses: [
      ...student.courses,
      ...plan.terms.slice(0, index + 1).flatMap((t) =>
        t.kind === "study"
          ? t.courses.map((code): StudentCourse => ({
              code,
              grade: null,
              term: t.id,
              institution: "SFU",
              status: "planned",
            }))
          : [],
      ),
    ],
  });
  let graduationTerm: string | null = null;
  let graduationTermExcludingUnknown: string | null = null;
  let auditAfterPlan: AuditResult = currentAudit;
  plan.terms.forEach((term, i) => {
    const result = audit(plannedThrough(i), catalog, { includePlanned: true });
    const applicable = result.results.filter(
      (r) => r.status !== "not_applicable",
    );
    if (
      graduationTerm === null &&
      applicable.every((r) => r.status === "met" || r.status === "in_progress")
    ) {
      graduationTerm = term.id;
    }
    if (
      graduationTermExcludingUnknown === null &&
      applicable.every((r) => r.status !== "unmet")
    ) {
      graduationTermExcludingUnknown = term.id;
    }
    auditAfterPlan = result;
  });

  const order = new Map(plan.terms.map((t, i) => [t.id, i]));
  // Term order, then course code, with term-level violations (no course) last in their term.
  const byCourse = (a: string | null, b: string | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);
  violations.sort(
    (a, b) =>
      (order.get(a.termId) ?? 0) - (order.get(b.termId) ?? 0) ||
      byCourse(a.courseCode, b.courseCode) ||
      a.code.localeCompare(b.code),
  );

  return {
    violations,
    terms,
    graduationTerm,
    graduationTermExcludingUnknown,
    graduationAssumesValidPlan: violations.some((v) => v.severity === "error"),
    graduationBlockers: auditAfterPlan.results
      .filter((r) => r.status === "unmet" || r.status === "unknown")
      .map((r) => ({ reqId: r.reqId, status: r.status })),
    auditAfterPlan,
  };
}
