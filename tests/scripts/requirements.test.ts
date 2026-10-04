import { describe, expect, test } from "vitest";
import {
  CONCENTRATIONS,
  REQUIREMENTS_COLUMNS,
  RULES,
  findUnknownFilterTerms,
  fromReqsIds,
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
      concentration: null,
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

  test.each(RULES)("accepts rule %s", (rule) => {
    expect(parse({ rule }).success).toBe(true);
  });

  test.each(["choose N", "courses from", "gpa", "declare concentrations", ""])(
    "rejects rule %j on an in-scope row",
    (rule) => {
      expect(parse({ rule }).success).toBe(false);
    },
  );

  test.each(CONCENTRATIONS)("accepts concentration %s", (concentration) => {
    expect(parse({ concentration }).data?.concentration).toBe(concentration);
  });

  test.each(["Innovation & Entrepreneurship", "finance", "Economics"])(
    "rejects concentration %s",
    (concentration) => {
      expect(parse({ concentration }).success).toBe(false);
    },
  );

  test("out-of-scope rows may use any rule", () => {
    const result = parse({ status: "out-of-scope", rule: "minimum fraction" });
    expect(result.success).toBe(true);
    expect(result.data?.rule).toBe("minimum fraction");
  });

  test("out-of-scope rows still get every other check", () => {
    expect(
      parse({ status: "out-of-scope", rule: "x", designation: "B" }).success,
    ).toBe(false);
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
        "dept BUS,BUEC",
        "dept not in BUS,BUEC",
        "subject business",
        "subject outside major",
        "subject in major",
        "outside Beedie",
        "institution SFU",
        "course_units >= 3",
        "earned_units >= 45",
        "exclude BUS 425|BUS 478|BUS 496",
        "purpose graduation",
        "purpose entry_to_300_400_BUS",
        "degree first_bachelors",
        "program courses",
        "all courses",
        "if institution SFU then course_units >= 3",
        "level upper",
        "level lower",
        "level 400",
        "not allocated to designated breadth",
        "group Lower core|Upper core",
        "group Beedie",
        "from_reqs test-group-a|test-group-b",
        "from_reqs test-group-a",
        "within marketing-total",
      ]),
    ).toEqual([]);
  });

  test("within names exactly one req_id", () => {
    expect(
      findUnknownFilterTerms(["within a|b", "within", "within a b"]),
    ).toEqual(["within a|b", "within", "within a b"]);
  });

  test("reports anything else", () => {
    const unknown = [
      "SFU business courses",
      "exclude practicum,BUS 478",
      "degree second_bachelors",
      "purpose admission",
      "dept bus",
      "group Core",
      "group Lower core|",
      "from_reqs",
      "from_reqs a b",
    ];
    expect(findUnknownFilterTerms(unknown)).toEqual(unknown);
  });

  test("fromReqsIds lists every named req_id", () => {
    expect(
      fromReqsIds(["dept BUS", "from_reqs test-group-a|test-group-b"]),
    ).toEqual(["test-group-a", "test-group-b"]);
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
      toCsv([{ ...goodRow, filter: "SFU business courses; dept BUS" }]),
    );
    expect(result.unknownFilterTerms).toEqual([
      { sheetRow: 2, reqId: "test-upper-bus", term: "SFU business courses" },
    ]);
    expect(result.counts.concentration).toEqual({ "(all)": 1 });
  });

  test("accepts from_reqs naming rows anywhere in the sheet", () => {
    const result = validateRequirementsCsv(
      toCsv([
        { ...goodRow, req_id: "test-total", filter: "from_reqs test-group-a" },
        { ...goodRow, req_id: "test-group-a" },
      ]),
    );
    expect(result.errors).toEqual([]);
  });

  test("rejects from_reqs naming a missing req_id", () => {
    const result = validateRequirementsCsv(
      toCsv([
        {
          ...goodRow,
          req_id: "test-total",
          filter: "from_reqs test-group-a|test-missing",
        },
        { ...goodRow, req_id: "test-group-a" },
      ]),
    );
    expect(result.errors).toEqual([
      'sheet row 2 (req_id test-total): filter: from_reqs names unknown req_id "test-missing"',
    ]);
  });

  test("skips rule and filter checks on out-of-scope rows", () => {
    const result = validateRequirementsCsv(
      toCsv([
        {
          ...goodRow,
          status: "out-of-scope",
          rule: "minimum fraction",
          filter: "denominator program_total_units",
        },
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.unknownFilterTerms).toEqual([]);
    expect(result.rows[0]?.status).toBe("out-of-scope");
  });
});

describe("within (subset rows)", () => {
  const parent = {
    ...goodRow,
    req_id: "test-parent",
    rule: "n courses",
    n_or_units: "4",
    courses: "BUS 345, BUS 441",
  };
  const child = (filter: string, req_id = "test-child") => ({
    ...goodRow,
    req_id,
    rule: "n courses",
    n_or_units: "1",
    courses: "BUS 345",
    filter,
  });

  test("accepts a within term naming an existing row (before or after it)", () => {
    expect(
      validateRequirementsCsv(toCsv([parent, child("within test-parent")]))
        .errors,
    ).toEqual([]);
    expect(
      validateRequirementsCsv(toCsv([child("within test-parent"), parent]))
        .errors,
    ).toEqual([]);
  });

  test("rejects a within term naming a missing req_id", () => {
    expect(
      validateRequirementsCsv(toCsv([parent, child("within test-missing")]))
        .errors,
    ).toEqual([
      'sheet row 3 (req_id test-child): filter: within names unknown req_id "test-missing"',
    ]);
  });

  test("rejects within naming the row itself, and two within terms", () => {
    expect(
      validateRequirementsCsv(toCsv([child("within test-child")])).errors,
    ).toEqual([
      "sheet row 2 (req_id test-child): filter: within names the row itself",
    ]);
    expect(
      validateRequirementsCsv(
        toCsv([parent, child("within test-parent; within test-parent")]),
      ).errors,
    ).toContain(
      "sheet row 3 (req_id test-child): filter: more than one within term",
    );
  });
});
