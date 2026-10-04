import {
  courseSchema,
  type Course,
  type CourseOfferings,
  type UnknownCourse,
} from "@/lib/data/catalog";
import { expandDesignation } from "./designations";

// Pure builders for data/generated/courses.json, offerings.json and unknown-courses.json.
// Inputs are the fetch manifest and stripped outlines (data/raw/outlines/); build-data.ts
// does the file I/O. Values are copied as returned; nothing is parsed or guessed.

/** The part of data/raw/outlines/_manifest.json these builders read. */
export type ManifestCourse = {
  title: string | null;
  ran: string[];
  /** Term ("2026/fall") -> section types, for terms with at least one section. */
  sections?: Record<string, string[]>;
  outline: string | null;
};

/** "2026/fall" -> "2026-fall". */
export function termKey(slashTerm: string): string {
  return slashTerm.replace("/", "-");
}

/** Hundreds of the course number: "BUS 217W" -> 200. */
export function courseLevel(code: string): number {
  const digits = /^\S+ (\d{3})/.exec(code)?.[1];
  return digits === undefined
    ? Number.NaN
    : Math.floor(Number(digits) / 100) * 100;
}

function optionalText(
  info: Record<string, unknown>,
  field: string,
  errors: string[],
): string | null {
  const value = info[field];
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  errors.push(`info.${field} is a ${typeof value}, expected text`);
  return null;
}

export type CourseBuild = { course: Course | null; errors: string[] };

/** One courses.json record from a stripped outline's `info`. */
export function buildCourse(
  code: string,
  info: Record<string, unknown>,
  sourceTerm: string,
  fallbackTitle: string | null = null,
): CourseBuild {
  const errors: string[] = [];

  let units: number | null = null;
  const rawUnits = info.units;
  if (typeof rawUnits === "string" && /^\d+(\.\d+)?$/.test(rawUnits.trim())) {
    units = Number(rawUnits);
  } else if (rawUnits !== undefined && rawUnits !== null && rawUnits !== "") {
    errors.push(`units ${JSON.stringify(rawUnits)} is not a number`);
  }

  const designationRaw = optionalText(info, "designation", errors);
  let designations: Course["designations"] = [];
  if (designationRaw !== null) {
    const expanded = expandDesignation(designationRaw);
    if (expanded.ok) designations = expanded.codes;
    else {
      errors.push(
        `designation ${JSON.stringify(designationRaw)} has unknown parts: ${expanded.unresolved
          .map((p) => JSON.stringify(p))
          .join(", ")}`,
      );
    }
  }

  const candidate = {
    code,
    title: optionalText(info, "title", errors) ?? fallbackTitle,
    units,
    level: courseLevel(code),
    department: code.split(" ")[0] ?? "",
    prerequisites_text: optionalText(info, "prerequisites", errors),
    corequisites_text: optionalText(info, "corequisites", errors),
    requirements_text: optionalText(info, "requirements", errors),
    short_note: optionalText(info, "shortNote", errors),
    description: optionalText(info, "description", errors),
    designations,
    designation_raw: designationRaw,
    source_term: termKey(sourceTerm),
  };
  if (errors.length > 0)
    return { course: null, errors: errors.map((e) => `${code}: ${e}`) };

  const parsed = courseSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      course: null,
      errors: parsed.error.issues.map(
        (i) => `${code}: ${i.path.join(".")}: ${i.message}`,
      ),
    };
  }
  return { course: parsed.data, errors: [] };
}

/**
 * offerings.json: per course, every term with at least one section (any type counts) as
 * "2025-fall": ["LEC", ...]. Terms in `futureTerms` go under `future` instead.
 */
export function buildOfferings(
  courses: Record<string, ManifestCourse>,
  futureTerms: ReadonlySet<string>,
): Record<string, CourseOfferings> {
  const out: Record<string, CourseOfferings> = {};
  for (const code of Object.keys(courses).sort()) {
    const confirmed: Record<string, string[]> = {};
    const future: Record<string, string[]> = {};
    const sections = courses[code]?.sections ?? {};
    for (const term of Object.keys(sections).sort(compareSlashTerms)) {
      const types = sections[term] ?? [];
      if (types.length === 0) continue;
      (futureTerms.has(term) ? future : confirmed)[termKey(term)] = [
        ...types,
      ].sort();
    }
    if (Object.keys(confirmed).length + Object.keys(future).length === 0)
      continue;
    out[code] = { ...confirmed, future } as CourseOfferings;
  }
  return out;
}

const TERM_ORDER = ["spring", "summer", "fall"];
function compareSlashTerms(a: string, b: string): number {
  const [ya, ta] = a.split("/");
  const [yb, tb] = b.split("/");
  return (
    Number(ya) - Number(yb) ||
    TERM_ORDER.indexOf(ta ?? "") - TERM_ORDER.indexOf(tb ?? "")
  );
}

export type UnknownCheck = { unknown: UnknownCourse[]; errors: string[] };

/**
 * Cross-check requirements.csv against courses.json. A code with no course record is
 * "offering unknown" only if the fetch manifest also reported it as having no data;
 * otherwise data is missing from disk (or the fetch is stale) and the build must fail.
 */
export function findUnknownCourses(
  requirementRefs: Record<string, string[]>,
  courseCodes: ReadonlySet<string>,
  manifestCodesWithoutData: readonly string[],
  termRange: string,
): UnknownCheck {
  const unknown: UnknownCourse[] = [];
  const errors: string[] = [];
  const reportedMissing = new Set(manifestCodesWithoutData);
  for (const [code, reqIds] of Object.entries(requirementRefs)) {
    if (courseCodes.has(code)) continue;
    if (reportedMissing.has(code)) {
      unknown.push({
        code,
        req_ids: reqIds,
        reason: `offering unknown: no outline found in ${termRange}`,
      });
    } else {
      errors.push(
        `${code} (named by ${reqIds.join(", ")}) is neither in courses.json nor reported without data by the fetch manifest; run npm run data:fetch`,
      );
    }
  }
  return { unknown, errors };
}
