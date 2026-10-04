import type { SummerChoice } from "./remaining";

// Default co-op placement (Stuart, 2026-10-04), used when the student is doing co-op but
// hasn't picked work terms: one 8-month placement (Fall + Spring) plus one more work term.
// ASSUMPTION: at least one study term (the start term) comes before the first work term,
// and one study term separates the placement from the third work term. The SFU calendar's
// co-op timing rules aren't checked; the student can pick other terms.

const SEASONS = ["spring", "summer", "fall"] as const;
const ordinal = (term: string) => {
  const [year, season] = term.split("-");
  return Number(year) * 3 + SEASONS.indexOf(season as (typeof SEASONS)[number]);
};
const termAt = (n: number) => `${Math.floor(n / 3)}-${SEASONS[n % 3]}`;

export function defaultCoopTerms(
  startTerm: string,
  summer: SummerChoice,
): string[] {
  let n = ordinal(startTerm) + 1;
  while (!termAt(n).endsWith("-fall")) n++;
  const fall = n;
  const spring = fall + 1;
  // The next study term after the placement, then the term after it.
  let study = spring + 1;
  if (summer === "none" && termAt(study).endsWith("-summer")) study++;
  return [termAt(fall), termAt(spring), termAt(study + 1)];
}
