// Removes everything about people (and grading, textbooks, schedules) from an outline
// before it is written to disk. Only `info` is kept, and only course-level fields.
// The field lists are documented in docs/outlines-api.md; keep them in sync.

/** `info` fields kept: course-level data plus which section/term the outline came from. */
export const KEPT_INFO_FIELDS = [
  "title",
  "units",
  "prerequisites",
  "corequisites",
  "designation",
  "description",
  "dept",
  "number",
  "degreeLevel",
  "deliveryMethod",
  "notes",
  "departmentalUgradNotes",
  "registrarNotes",
  "specialTopic",
  "type",
  "term",
  "section",
  "name",
  "classNumber",
  "outlinePath",
] as const;

/** `info` fields seen in samples and dropped on purpose. */
export const DROPPED_INFO_FIELDS = [
  "requiredReadingNotes", // textbooks
  "materials", // textbooks and materials
  "gradingNotes", // grading scheme
  "courseDetails", // one instructor's syllabus for one section
  "educationalGoals", // one instructor's syllabus for one section
  "requirements", // one instructor's section notes (policies, book lists, grading), not course requirements
  "shortNote", // one instructor's section notes
] as const;

/** Top-level outline keys dropped: people, grading, textbooks, schedules. */
export const DROPPED_TOP_LEVEL = [
  "instructor",
  "grades",
  "requiredText",
  "courseSchedule",
  "examSchedule", // first seen in the BUS-only run, 2026-10-03
  "recommendedText", // textbooks; first seen in the full run, 2026-10-03
] as const;

export type StrippedOutline = { info: Record<string, unknown> };

export type StripResult = {
  outline: StrippedOutline;
  /** Keys not in any list above. They are dropped, and reported so a human can decide. */
  unknownKeys: string[];
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
const NAME_FIELDS = ["name", "commonName", "firstName", "lastName"] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Instructor names, longest first so full names are replaced before their parts. */
function instructorNames(instructor: unknown): string[] {
  if (!Array.isArray(instructor)) return [];
  const names = new Set<string>();
  for (const person of instructor) {
    if (typeof person !== "object" || person === null) continue;
    const record = person as Record<string, unknown>;
    for (const field of NAME_FIELDS) {
      const value = record[field];
      if (typeof value === "string" && value.trim().length >= 3) {
        names.add(value.trim());
      }
    }
    const first = record.firstName;
    const last = record.lastName;
    if (typeof first === "string" && typeof last === "string") {
      names.add(`${first.trim()} ${last.trim()}`);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/** Removes emails, phone numbers, and the given names from free text. */
export function scrubText(text: string, names: readonly string[]): string {
  let out = text
    .replace(EMAIL, "[email removed]")
    .replace(PHONE, "[phone removed]");
  for (const name of names) {
    // Case-sensitive whole words, so a first name like "Will" doesn't remove "will".
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"),
      "[name removed]",
    );
  }
  return out;
}

/** scrubText applied to every string, including inside arrays and objects. */
function scrubValue(value: unknown, names: readonly string[]): unknown {
  if (typeof value === "string") return scrubText(value, names);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, names));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, scrubValue(v, names)]),
    );
  }
  return value;
}

export function stripOutline(outline: Record<string, unknown>): StripResult {
  const unknownKeys: string[] = [];
  for (const key of Object.keys(outline)) {
    if (
      key !== "info" &&
      !(DROPPED_TOP_LEVEL as readonly string[]).includes(key)
    ) {
      unknownKeys.push(key);
    }
  }

  const names = instructorNames(outline.instructor);
  const info = (outline.info ?? {}) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if ((KEPT_INFO_FIELDS as readonly string[]).includes(key)) {
      kept[key] = scrubValue(value, names);
    } else if (!(DROPPED_INFO_FIELDS as readonly string[]).includes(key)) {
      unknownKeys.push(`info.${key}`);
    }
  }
  return { outline: { info: kept }, unknownKeys };
}
