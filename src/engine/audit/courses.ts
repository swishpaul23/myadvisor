import type { Course } from "@/lib/data/catalog";
import { attemptScore, earnsUnits, gradePoints } from "./grades";
import type { Catalog, Policy, Student, StudentCourse } from "./types";

// Turns the student's attempts into one fact per course code (repeats collapsed), for a
// given tier: "completed" counts completed attempts only; "pending" also counts
// in-progress (and, with includePlanned, planned) courses as if passed.

export type CourseFact = {
  code: string;
  dept: string;
  number: number;
  /** Hundreds of the number: BUS 217W -> 200. */
  level: number;
  /** courses.json units, else student-supplied, else null (unknown). */
  units: number | null;
  /** courses.json designations; null when the course isn't in courses.json (unknown). */
  designations: string[] | null;
  /** Best completed grade; null for a pending course. */
  grade: string | null;
  institution: "SFU" | "transfer";
  /** Counted only because it is in progress/planned (tier 2): assumed to pass. */
  pending: boolean;
  /** Earns units in this tier (passing completed attempt, or pending). */
  earns: boolean;
};

export function parseCode(code: string): { dept: string; number: number } {
  const match = /^([A-Z]{2,5}) (\d{3})/.exec(code);
  return { dept: match?.[1] ?? "", number: match ? Number(match[2]) : NaN };
}

export function catalogIndex(catalog: Catalog): Map<string, Course> {
  return new Map(catalog.courses.map((c) => [c.code, c]));
}

function unitsFor(
  code: string,
  attempts: StudentCourse[],
  index: Map<string, Course>,
): number | null {
  const known = index.get(code)?.units;
  if (known !== undefined && known !== null) return known;
  const supplied = attempts.find((a) => a.units !== undefined)?.units;
  return supplied ?? null;
}

export function buildFacts(
  student: Student,
  catalog: Catalog,
  tier: "completed" | "pending",
  includePlanned = false,
): Map<string, CourseFact> {
  const policy = catalog.policy;
  const index = catalogIndex(catalog);
  const byCode = new Map<string, StudentCourse[]>();
  for (const attempt of student.courses) {
    byCode.set(attempt.code, [...(byCode.get(attempt.code) ?? []), attempt]);
  }

  const facts = new Map<string, CourseFact>();
  for (const [code, attempts] of [...byCode].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const completed = attempts.filter((a) => a.status === "completed");
    const best = [...completed].sort(
      (a, b) => attemptScore(a.grade, policy) - attemptScore(b.grade, policy),
    )[0];
    const pendingStatuses = includePlanned
      ? ["in_progress", "planned"]
      : ["in_progress"];
    const pendingAttempt = attempts.find((a) =>
      pendingStatuses.includes(a.status),
    );
    const passed = best !== undefined && earnsUnits(best.grade, policy);

    let grade: string | null;
    let pending = false;
    if (passed) grade = best.grade;
    else if (tier === "pending" && pendingAttempt) {
      grade = null;
      pending = true;
    } else if (best)
      grade = best.grade; // completed but not passed (F, W, ...)
    else continue; // only in progress/planned, and this tier doesn't count them

    const { dept, number } = parseCode(code);
    const course = index.get(code);
    const source = best ?? pendingAttempt ?? attempts[0]!;
    facts.set(code, {
      code,
      dept,
      number,
      level: Math.floor(number / 100) * 100,
      units: unitsFor(code, attempts, index),
      designations: course ? course.designations : null,
      grade,
      institution: source.institution,
      pending,
      earns: passed || pending,
    });
  }
  return facts;
}

export type GpaAttempt = {
  code: string;
  dept: string;
  number: number;
  units: number | null;
  points: number;
  institution: "SFU" | "transfer";
};

/**
 * One graded attempt per course for GPA: completed, letter-graded (P, W, CR excluded), the
 * higher grade when repeated (policy repeated_courses).
 */
export function gpaAttempts(student: Student, catalog: Catalog): GpaAttempt[] {
  const policy: Policy = catalog.policy;
  const index = catalogIndex(catalog);
  const best = new Map<string, { attempt: StudentCourse; points: number }>();
  for (const attempt of student.courses) {
    if (attempt.status !== "completed") continue;
    const points = gradePoints(attempt.grade, policy);
    if (points === null) continue;
    const current = best.get(attempt.code);
    if (!current || points > current.points)
      best.set(attempt.code, { attempt, points });
  }
  return [...best.values()]
    .map(({ attempt, points }) => {
      const { dept, number } = parseCode(attempt.code);
      const attempts = student.courses.filter((a) => a.code === attempt.code);
      return {
        code: attempt.code,
        dept,
        number,
        units: unitsFor(attempt.code, attempts, index),
        points,
        institution: attempt.institution,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
