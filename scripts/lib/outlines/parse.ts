import { z } from "zod";

// Shapes observed in data/raw/_samples/ (see docs/outlines-api.md). Parsing fails loudly
// on anything else, so an API change is reported instead of silently misread.

const listItem = z.object({ text: z.string(), value: z.string() });

const yearsSchema = z.array(listItem);
const termsSchema = z.array(listItem);
const departmentsSchema = z.array(
  listItem.extend({ name: z.string().optional() }),
);
// `title` is missing on some entries (e.g. ENGL 345 in 2025 spring); see docs/outlines-api.md.
const coursesSchema = z.array(
  listItem.extend({ title: z.string().optional() }),
);
const sectionsSchema = z.array(
  listItem.extend({
    title: z.string(),
    classType: z.string(),
    sectionCode: z.string(),
    associatedClass: z.string().optional(),
  }),
);
const outlineSchema = z.looseObject({
  info: z.looseObject({ dept: z.string(), number: z.string() }),
});

export type CourseListItem = z.output<typeof coursesSchema>[number];
export type SectionListItem = z.output<typeof sectionsSchema>[number];

function parseWith<T>(schema: z.ZodType<T>, what: string, json: unknown): T {
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `Unexpected ${what} response: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export const parseYears = (json: unknown) =>
  parseWith(yearsSchema, "years", json);
export const parseTerms = (json: unknown) =>
  parseWith(termsSchema, "terms", json);
export const parseDepartments = (json: unknown) =>
  parseWith(departmentsSchema, "departments", json);
export const parseCourses = (json: unknown) =>
  parseWith(coursesSchema, "courses", json);
export const parseSections = (json: unknown) =>
  parseWith(sectionsSchema, "sections", json);
export const parseOutline = (json: unknown) =>
  parseWith(outlineSchema, "outline", json);

/** Leading digits of a course number such as "217w" -> 217. */
export function courseNumberValue(number: string): number {
  const match = /^(\d+)/.exec(number);
  return match ? Number(match[1]) : Number.NaN;
}

export function isUndergraduate(
  number: string,
  maxCourseNumber = 499,
): boolean {
  const n = courseNumberValue(number);
  return Number.isFinite(n) && n <= maxCourseNumber;
}

/** "bus", "217w" -> "BUS 217W". */
export function courseCode(dept: string, number: string): string {
  return `${dept.toUpperCase()} ${number.toUpperCase()}`;
}

/** "BUS 217W" -> { dept: "bus", number: "217w" }. */
export function splitCourseCode(code: string): {
  dept: string;
  number: string;
} {
  const match = /^([A-Za-z]{2,5}) (\d{3}[A-Za-z]?)$/.exec(code.trim());
  if (!match) throw new Error(`"${code}" is not a course code like "BUS 217W"`);
  return { dept: match[1]!.toLowerCase(), number: match[2]!.toLowerCase() };
}

/** Distinct section types in a section list, sorted, e.g. ["LEC", "TUT"]. */
export function sectionTypes(sections: SectionListItem[]): string[] {
  return [...new Set(sections.map((s) => s.sectionCode))].sort();
}

/**
 * Sections to try for the course outline, best first: lectures (LEC) that students
 * enrol in (classType "e"), then any other enrolment section.
 */
export function outlineSectionCandidates(
  sections: SectionListItem[],
): SectionListItem[] {
  const enrolment = sections.filter((s) => s.classType === "e");
  return [
    ...enrolment.filter((s) => s.sectionCode === "LEC"),
    ...enrolment.filter((s) => s.sectionCode !== "LEC"),
  ];
}
