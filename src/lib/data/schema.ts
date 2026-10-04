import { z } from "zod";

// Zod schema for one row of data/sheets/requirements.csv. See "Data contract" in CLAUDE.md.
// Input is the raw CSV record (every cell a string, blank cells ""); output is typed.

export const REQUIREMENTS_COLUMNS = [
  "req_id",
  "program",
  "concentration",
  "catalog_term",
  "group",
  "rule",
  "n_or_units",
  "courses",
  "level_min",
  "level_max",
  "designation",
  "filter",
  "min_grade",
  "notes",
  "source_url",
  "status",
  "verified_by",
] as const;

export const PROGRAMS = ["BBA", "*"] as const;
export const GROUPS = [
  "Lower core",
  "Upper core",
  "Concentration",
  "Beedie",
  "University",
] as const;
export const RULES = [
  "one course",
  "choose N",
  "all of",
  "units from",
  "courses from",
  "gpa",
] as const;
export const DESIGNATIONS = ["W", "Q", "B-Soc", "B-Hum", "B-Sci"] as const;
export const STATUSES = ["beta", "verified", "out-of-scope"] as const;
// Letter grades from data/policy/sfu.json that can be a minimum, plus P (pass).
export const MIN_GRADES = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D",
  "P",
] as const;

const COURSE_CODE = /^[A-Z]{2,5} \d{3}[A-Z]?$/;

// Allowed `filter` terms. Anything else is reported by build-data, never guessed at.
const FILTER_TERM_PATTERNS = [
  /^dept [A-Z]{2,5}$/,
  /^institution SFU$/,
  /^course_units >= \d+(\.\d+)?$/,
  /^exclude [A-Z]{2,5} \d{3}[A-Z]?(\|[A-Z]{2,5} \d{3}[A-Z]?)*$/,
  /^subject outside major$/,
  /^subject in major$/,
  /^degree first_bachelors$/,
];

export function splitFilterTerms(filter: string): string[] {
  return filter
    .split(";")
    .map((term) => term.trim())
    .filter((term) => term !== "");
}

export function findUnknownFilterTerms(terms: readonly string[]): string[] {
  return terms.filter(
    (term) => !FILTER_TERM_PATTERNS.some((pattern) => pattern.test(term)),
  );
}

const text = z.string().trim();

const optionalNumber = text.transform((s, ctx) => {
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({
      code: "custom",
      message: `must be a non-negative number, got "${s}"`,
    });
    return z.NEVER;
  }
  return n;
});

const optionalLevel = text.transform((s, ctx) => {
  if (s === "") return null;
  if (!/^\d+$/.test(s) || Number(s) < 100 || Number(s) > 499) {
    ctx.addIssue({
      code: "custom",
      message: `must be a whole course number from 100 to 499, got "${s}"`,
    });
    return z.NEVER;
  }
  return Number(s);
});

const courseList = text.transform((s, ctx) => {
  if (s === "") return [];
  const codes = s.split(",").map((c) => c.trim());
  for (const code of codes) {
    if (!COURSE_CODE.test(code)) {
      ctx.addIssue({
        code: "custom",
        message: `"${code}" is not a course code like "BUS 201" or "BUS 217W"`,
      });
    }
  }
  return codes;
});

const designationList = text.transform((s, ctx) => {
  if (s === "") return [];
  const values = s.split("|").map((d) => d.trim());
  for (const value of values) {
    if (!(DESIGNATIONS as readonly string[]).includes(value)) {
      ctx.addIssue({
        code: "custom",
        message: `"${value}" is not one of ${DESIGNATIONS.join(", ")}`,
      });
    }
  }
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: "custom", message: `"${s}" repeats a designation` });
  }
  return values as (typeof DESIGNATIONS)[number][];
});

const blankOr = <T extends readonly [string, ...string[]]>(values: T) =>
  text.pipe(z.union([z.literal(""), z.enum(values)]));

export const requirementRowSchema = z
  .object({
    req_id: text.regex(/^\S+$/, "must be non-empty with no spaces"),
    program: text.pipe(z.enum(PROGRAMS)),
    concentration: text,
    catalog_term: text.pipe(z.literal("2026-fall")),
    group: text.pipe(z.enum(GROUPS)),
    rule: text.pipe(z.enum(RULES)),
    n_or_units: optionalNumber,
    courses: courseList,
    level_min: optionalLevel,
    level_max: optionalLevel,
    designation: designationList,
    filter: text.transform(splitFilterTerms),
    min_grade: blankOr(MIN_GRADES).transform((g) => (g === "" ? null : g)),
    notes: text,
    source_url: text.regex(/^https?:\/\/\S+$/, "must be an http(s) URL"),
    status: text.pipe(z.enum(STATUSES)),
    verified_by: text,
  })
  .superRefine((row, ctx) => {
    if (
      row.level_min !== null &&
      row.level_max !== null &&
      row.level_min > row.level_max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["level_min"],
        message: `${row.level_min} is greater than level_max ${row.level_max}`,
      });
    }
    if (row.status === "verified" && row.verified_by === "") {
      ctx.addIssue({
        code: "custom",
        path: ["verified_by"],
        message: "must name the person who verified the row",
      });
    }
    if (row.status === "beta" && row.verified_by !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["verified_by"],
        message: `must be blank until a human verifies the row, got "${row.verified_by}"`,
      });
    }
  });

export type RequirementRow = z.output<typeof requirementRowSchema>;
