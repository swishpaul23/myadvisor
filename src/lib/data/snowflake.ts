import "server-only";
import { query } from "@/lib/snowflake";
import {
  coursesFileSchema,
  offeringsFileSchema,
  type Course,
  type CourseOfferings,
} from "./catalog";
import {
  extractCourseCodes,
  extractKeywords,
  SEARCH_LIMIT,
  type CalendarHit,
} from "./calendar-search";
import { prereqsFileSchema, type PrereqRecord } from "./prereqs";
import { requirementRecordSchema, type RequirementRow } from "./schema";

// Reads reference data from myadvisor.app (tables built by load-snowflake.mjs from the
// same data/generated/ files). Every result is checked with the same zod schemas as the
// JSON snapshot, so a missing or renamed column fails loudly instead of feeding the engine
// bad data. Snowflake returns column names in upper case.

const T = "myadvisor.app";

/** VARIANT values usually arrive parsed; parse them if the driver hands back a string. */
function variant(value: unknown): unknown {
  return typeof value === "string"
    ? (JSON.parse(value) as unknown)
    : (value ?? null);
}

const num = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

export async function readCourses(): Promise<Course[]> {
  const rows = await query(
    `SELECT code, title, units, course_level, department, prerequisites_text,
            corequisites_text, description, designations, designation_raw, source_term
     FROM ${T}.courses ORDER BY code`,
  );
  return coursesFileSchema.parse(
    rows.map((r) => ({
      code: r.CODE,
      title: r.TITLE,
      units: num(r.UNITS),
      level: num(r.COURSE_LEVEL),
      department: r.DEPARTMENT,
      prerequisites_text: r.PREREQUISITES_TEXT,
      corequisites_text: r.COREQUISITES_TEXT,
      description: r.DESCRIPTION,
      designations: variant(r.DESIGNATIONS),
      designation_raw: r.DESIGNATION_RAW,
      source_term: r.SOURCE_TERM,
    })),
  );
}

/** prereq and coreq are VARIANT trees in the prereqs.json node format. */
export async function readPrereqs(): Promise<PrereqRecord[]> {
  const rows = await query(
    `SELECT code, prereq, coreq, status, source, raw_text, raw_coreq, advisory,
            unparsed_fragments
     FROM ${T}.prereqs ORDER BY code`,
  );
  return prereqsFileSchema.parse(
    rows.map((r) => ({
      code: r.CODE,
      prereq: variant(r.PREREQ),
      coreq: variant(r.COREQ),
      status: r.STATUS,
      source: r.SOURCE,
      raw: r.RAW_TEXT,
      raw_coreq: r.RAW_COREQ,
      advisory: variant(r.ADVISORY),
      unparsed_fragments: variant(r.UNPARSED_FRAGMENTS),
    })),
  );
}

export type RequirementCourse = { req_id: string; course_code: string };

/** One row per (requirement, course), in the order the sheet lists them. */
export async function readRequirementCourses(): Promise<RequirementCourse[]> {
  const rows = await query(
    `SELECT req_id, course_code FROM ${T}.requirement_courses ORDER BY req_id, position`,
  );
  return rows.map((r) => ({
    req_id: String(r.REQ_ID),
    course_code: String(r.COURSE_CODE),
  }));
}

/**
 * Requirement rows in sheet order (the engine's matching depends on it), with `courses`
 * rebuilt from requirement_courses.
 */
export async function readRequirements(): Promise<RequirementRow[]> {
  const [rows, links] = await Promise.all([
    query(
      `SELECT req_id, program, concentration, catalog_term, req_group, rule_type,
              n_or_units, level_min, level_max, designation, filter_spec, min_grade,
              notes, source_url, status, verified_by
       FROM ${T}.requirements ORDER BY position`,
    ),
    readRequirementCourses(),
  ]);
  const courses = new Map<string, string[]>();
  for (const { req_id, course_code } of links) {
    courses.set(req_id, [...(courses.get(req_id) ?? []), course_code]);
  }
  return requirementRecordSchema.array().parse(
    rows.map((r) => ({
      req_id: r.REQ_ID,
      program: r.PROGRAM,
      concentration: r.CONCENTRATION,
      catalog_term: r.CATALOG_TERM,
      group: r.REQ_GROUP,
      rule: r.RULE_TYPE,
      n_or_units: num(r.N_OR_UNITS),
      courses: courses.get(String(r.REQ_ID)) ?? [],
      level_min: num(r.LEVEL_MIN),
      level_max: num(r.LEVEL_MAX),
      designation: variant(r.DESIGNATION),
      filter: variant(r.FILTER_SPEC),
      min_grade: r.MIN_GRADE,
      notes: r.NOTES,
      source_url: r.SOURCE_URL,
      status: r.STATUS,
      verified_by: r.VERIFIED_BY,
    })),
  );
}

/** Keyed by course code, the same shape as offerings.json. */
export async function readCourseOfferings(): Promise<
  Record<string, CourseOfferings>
> {
  const rows = await query(
    `SELECT code, offerings FROM ${T}.course_offerings ORDER BY code`,
  );
  return offeringsFileSchema.parse(
    Object.fromEntries(rows.map((r) => [r.CODE, variant(r.OFFERINGS)])),
  );
}

const toHits = (rows: Record<string, unknown>[]): CalendarHit[] =>
  rows.map((r) => ({
    text: String(r.TEXT),
    course_code: r.COURSE_CODE === null ? null : String(r.COURSE_CODE),
    source_url: String(r.SOURCE_URL),
  }));

/**
 * Plain SQL search of calendar_chunks (no Cortex Search, no EMBED). Course codes in the
 * question: exact course_code matches first, then chunks whose text mentions the code.
 * No code, or no rows for it: chunks containing the longest keywords, most matched first.
 * The question text is only ever sent as binds.
 */
export async function searchCalendarSnowflake(
  question: string,
): Promise<CalendarHit[]> {
  const codes = extractCourseCodes(question);
  if (codes.length > 0) {
    const list = codes.map(() => "?").join(", ");
    const mentions = codes.map(() => `text ILIKE '%' || ? || '%'`).join(" OR ");
    const rows = await query(
      `SELECT text, course_code, source_url FROM ${T}.calendar_chunks
       WHERE course_code IN (${list}) OR ${mentions}
       ORDER BY IFF(course_code IN (${list}), 0, 1), course_code NULLS LAST, text
       LIMIT ${SEARCH_LIMIT}`,
      [...codes, ...codes, ...codes],
    );
    if (rows.length > 0) return toHits(rows);
  }
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return [];
  const likes = keywords.map(() => `text ILIKE ?`);
  const patterns = keywords.map((k) => `%${k}%`); // keywords are [a-z0-9] only: no % or _
  const rows = await query(
    `SELECT text, course_code, source_url FROM ${T}.calendar_chunks
     WHERE ${likes.join(" OR ")}
     ORDER BY ${likes.map((l) => `IFF(${l}, 1, 0)`).join(" + ")} DESC,
              course_code NULLS LAST, text
     LIMIT ${SEARCH_LIMIT}`,
    [...patterns, ...patterns],
  );
  return toHits(rows);
}
