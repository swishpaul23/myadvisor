import type { CourseOfferings } from "@/lib/data/catalog";

// Offering rule (docs/validator-spec.md section 3): a course is offered in a planned
// "Y-season" if it ran in that season in Y-1 or Y-2 (or Y, if confirmed). Only terms the
// data has confirmed count; if none of those are in the data, the two latest confirmed
// terms of that season are used. Otherwise, a course listed only for a future term of that
// season is FUTURE_ONLY, and anything else is RECENTLY (not offered in recent history).

export type OfferingCheck = {
  result: "offered" | "future_only" | "not_recently";
  window: string[];
};

/** Every term that has confirmed sections for some course, e.g. "2025-spring". */
export function confirmedTerms(
  offerings: Record<string, CourseOfferings>,
): Set<string> {
  const terms = new Set<string>();
  for (const course of Object.values(offerings)) {
    for (const key of Object.keys(course)) if (key !== "future") terms.add(key);
  }
  return terms;
}

export function checkOffering(
  code: string,
  termId: string,
  offerings: Record<string, CourseOfferings>,
  confirmed: Set<string>,
): OfferingCheck {
  const [yearText, season] = termId.split("-");
  const year = Number(yearText);
  let window = [
    `${year}-${season}`,
    `${year - 1}-${season}`,
    `${year - 2}-${season}`,
  ].filter((t) => confirmed.has(t));
  if (window.length === 0) {
    window = [...confirmed]
      .filter((t) => t.endsWith(`-${season}`))
      .sort()
      .slice(-2);
  }
  const course = offerings[code];
  if (course && window.some((t) => t in course))
    return { result: "offered", window };
  const future = course ? Object.keys(course.future ?? {}) : [];
  if (future.some((t) => t.endsWith(`-${season}`)))
    return { result: "future_only", window };
  return { result: "not_recently", window };
}
