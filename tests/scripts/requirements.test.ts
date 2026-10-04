import { describe, expect, test } from "vitest";
import {
  REQUIREMENTS_COLUMNS,
  findUnknownFilterTerms,
  requirementRowSchema,
} from "@/lib/data/schema";
import { validateRequirementsCsv } from "../../scripts/validate-requirements";

// Fixtures are made-up shapes for testing the validator, not real requirement data.
const goodRow: Record<(typeof REQUIREMENTS_COLUMNS)[number], string> = {
  req_id: "test-upper-bus",
  program: "BBA",
  concentration: "",
  catalog_term: "2026-fall",
  group: "Upper core",
  rule: "units from",
  n_or_units: "6",
  courses: "BUS 312, BUS 217W",
  level_min: "300",
  level_max: "499",
  designation: "W|B-Soc",
  filter: "dept BUS; institution SFU",
  min_grade: "C-",
  notes: "",
  source_url: "https://www.sfu.ca/students/calendar/2026/fall/example.html",
  status: "beta",
  verified_by: "",
};

const parse = (overrides: Partial<typeof goodRow>) =>
  requirementRowSchema.safeParse({ ...goodRow, ...overrides });

function toCsv(rows: Record<string, string>[]): string {
  const cell = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [
    REQUIREMENTS_COLUMNS.join(","),
    ...rows.map((r) =>
      REQUIREMENTS_COLUMNS.map((c) => cell(r[c] ?? "")).join(","),
    ),
  ].join("\n");
}

describe("requirementRowSchema", () => {
  test("parses a good row into typed values", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      n_or_units: 6,
      courses: ["BUS 312", "BUS 217W"],
      level_min: 300,
      level_max: 499,
      designation: ["W", "B-Soc"],
      filter: ["dept BUS", "institution SFU"],
      min_grade: "C-",
    });
  });

  test("blank level and designation mean no restriction", () => {
    const result = parse({ level_min: "", level_max: "", designation: "" });
    expect(result.data).toMatchObject({
      level_min: null,
      level_max: null,
      designation: [],
    });
  });

  test.each(["3.5", "abc", "50", "500"])("rejects level_min %s", (level) => {
    expect(parse({ level_min: level }).success).toBe(false);
  });

  test("rejects level_min above level_max", () => {
    expect(parse({ level_min: "400", level_max: "300" }).success).toBe(false);
  });

  test.each(["B-Art", "W,Q", "W|W", "w"])(
    "rejects designation %s",
    (designation) => {
      expect(parse({ designation }).success).toBe(false);
    },
  );

  test.each(["source_checked", "needs_review", "Beta"])(
    "rejects status %s",
    (status) => {
      expect(parse({ status }).success).toBe(false);
    },
  );

  test("accepts out-of-scope status", () => {
    expect(parse({ status: "out-of-scope" }).success).toBe(true);
  });

  test("verified needs a verifier; beta must not have one", () => {
    expect(parse({ status: "verified", verified_by: "" }).success).toBe(false);
    expect(parse({ status: "verified", verified_by: "Stuart" }).success).toBe(
      true,
    );
    expect(parse({ status: "beta", verified_by: "Stuart" }).success).toBe(
      false,
    );
  });

  test("rejects a missing source_url and a malformed course code", () => {
    expect(parse({ source_url: "" }).success).toBe(false);
    expect(parse({ courses: "BUS312" }).success).toBe(false);
  });
});

describe("findUnknownFilterTerms", () => {
  test("accepts every allowed term", () => {
    expect(
      findUnknownFilterTerms([
        "dept BUS",
        "institution SFU",
        "course_units >= 3",
        "exclude BUS 425|BUS 478|BUS 496",
        "subject outside major",
        "subject in major",
        "degree first_bachelors",
      ]),
    ).toEqual([]);
  });

  test("reports anything else", () => {
    expect(
      findUnknownFilterTerms([
        "level upper",
        "dept not in BUS,BUEC",
        "exclude practicum,BUS 478",
      ]),
    ).toEqual([
      "level upper",
      "dept not in BUS,BUEC",
      "exclude practicum,BUS 478",
    ]);
  });
});

describe("validateRequirementsCsv", () => {
  test("a good file has no errors", () => {
    const result = validateRequirementsCsv(toCsv([goodRow]));
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  test("reports a duplicate req_id with both sheet rows", () => {
    const result = validateRequirementsCsv(toCsv([goodRow, goodRow]));
    expect(result.errors).toEqual([
      "sheet row 3 (req_id test-upper-bus): duplicate req_id, first used on sheet row 2",
    ]);
  });

  test("reports bad values with sheet row, req_id, and column", () => {
    const result = validateRequirementsCsv(
      toCsv([{ ...goodRow, level_max: "x" }]),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(
      /^sheet row 2 \(req_id test-upper-bus\): level_max: /,
    );
  });

  test("reports missing header columns", () => {
    const csv = toCsv([goodRow]).replace(
      ",level_min,level_max,designation",
      "",
    );
    expect(validateRequirementsCsv(csv).errors[0]).toBe(
      "header: missing columns level_min, level_max, designation",
    );
  });

  test("collects unknown filter terms and counts", () => {
    const result = validateRequirementsCsv(
      toCsv([{ ...goodRow, filter: "level upper; dept BUS" }]),
    );
    expect(result.unknownFilterTerms).toEqual([
      { sheetRow: 2, reqId: "test-upper-bus", term: "level upper" },
    ]);
    expect(result.counts.concentration).toEqual({ "(all)": 1 });
  });
});
