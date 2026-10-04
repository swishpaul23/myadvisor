import type { Policy } from "./types";

// Grade rules from data/policy/sfu.json. See docs/engine-spec.md section 3 and 5.

/** Position in the letter-grade order (0 = A+), or null for P, CR, W, unknown. */
export function letterRank(grade: string, policy: Policy): number | null {
  const i = policy.grade_order.letter_grades.indexOf(grade);
  return i === -1 ? null : i;
}

/** D or better, P, CR (policy grade_order.earns_units). F, FD, N, W earn nothing. */
export function earnsUnits(grade: string | null, policy: Policy): boolean {
  return grade !== null && policy.grade_order.earns_units.includes(grade);
}

/**
 * Does `grade` on course `code` meet `min`?
 * - blank minimum: any grade that earns units (ASSUMPTION for concentration rows)
 * - P: only on the pass/fail courses (BUS 203, 300, 496), where it meets any minimum
 * - CR (transfer): meets any minimum (ASSUMPTION; the caller adds a note)
 * - letters: at least as good as the minimum
 */
export function meetsMinimum(
  grade: string | null,
  min: string | null,
  code: string,
  policy: Policy,
): boolean {
  if (grade === null) return false;
  if (!earnsUnits(grade, policy)) return false;
  if (min === null) return true;
  if (grade === policy.transfer_credit.grade) return true;
  if (grade === "P") return policy.pass_fail_courses.courses.includes(code);
  if (min === "P") return true; // any passing letter on a pass/fail row
  const g = letterRank(grade, policy);
  const m = letterRank(min, policy);
  return g !== null && m !== null && g <= m;
}

/** Grade points for GPA, or null when the grade carries none (P, W, CR, unknown). */
export function gradePoints(
  grade: string | null,
  policy: Policy,
): number | null {
  if (grade === null || policy.grade_points.no_grade_points.includes(grade))
    return null;
  if (grade === policy.transfer_credit.grade) return null;
  const points = policy.grade_points.points[grade];
  return points === undefined ? null : points;
}

/**
 * Lower is better, for choosing the attempt that counts toward requirements:
 * A+..C- by rank, then P/CR (passing, quality unknown), then D, then F/FD/N, then W.
 */
export function attemptScore(grade: string | null, policy: Policy): number {
  if (grade === null) return 1000;
  const rank = letterRank(grade, policy);
  const cMinus = letterRank("C-", policy) ?? 8;
  if (rank !== null && rank <= cMinus) return rank;
  if (grade === "P" || grade === policy.transfer_credit.grade)
    return cMinus + 1;
  if (rank !== null) return rank + 2; // D, F, FD, N
  return 500; // W and anything else
}
