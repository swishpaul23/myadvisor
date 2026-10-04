import Papa from "papaparse";
import { describe, expect, test } from "vitest";
import {
  prereqNodeSchema,
  PREREQ_OVERRIDE_COLUMNS,
  type PrereqNode,
} from "@/lib/data/prereqs";
import { parsePrerequisites } from "../../scripts/lib/prereqs";
import { classifyFragment } from "../../scripts/lib/prereqs/fragments";
import {
  applyOverrides,
  parseOverridesCsv,
} from "../../scripts/lib/prereqs/overrides";

describe("count nodes", () => {
  test.each([
    ["two 200-division English courses", 2, 200],
    ["two 300-division English courses", 2, 300],
    ["one 100-division English course", 1, 100],
  ])("%j", (text, n, level) => {
    expect(classifyFragment(text)).toEqual({
      type: "count",
      n,
      subject: "ENGL",
      level,
      text,
    });
  });

  test.each([
    "Two 300-level PHIL courses", // different wording: not one of the agreed patterns
    "four 300 or 400-division English courses",
    "two 200-division English courses in poetry",
  ])("other wording stays unknown: %j", (text) => {
    expect(classifyFragment(text).type).toBe("unknown");
  });
});

describe("permission nodes", () => {
  test.each([
    ["permission of the instructor", "instructor"],
    ["permission of instructor", "instructor"],
    ["permission from the instructor", "instructor"],
    ["permission of the department", "department"],
    ["Permission of the department", "department"],
    ["permission of the co-op co-ordinator", "co-op coordinator"],
  ])("%j -> %s", (text, who) => {
    expect(classifyFragment(text)).toEqual({ type: "permission", who, text });
  });

  test.each([
    "Permission of the faculty",
    "permission of the undergraduate chair of the department",
    "Admission is by permission of the instructor and the department",
    "with the approval of the instructor or department",
  ])("other permission wording stays unknown: %j", (text) => {
    expect(classifyFragment(text).type).toBe("unknown");
  });
});

describe("restriction nodes", () => {
  test.each([
    "Reserved for English honours, major, joint major and minor students",
    "30 units for students enrolled in the SFU-Exeter accelerated law dual degree program",
    "This course is only open to approved business administration majors admitted to the faculty in Fall 2022 and onward",
    "The course is only open to students in the business minor program",
    "Enrolled in the philosophy honours program",
  ])("%j", (text) => {
    expect(classifyFragment(text)).toEqual({ type: "restriction", text });
  });

  test.each([
    // names a course, so the course requirement must stay visible as unknown text
    "Open only to students who have been accepted into the English honours program, and who have completed ENGL 494",
    // GPA rule
    "Must be in an honours program with a GPA of at least 3.0",
    // cannot-take rule, not a restriction pattern
    "Philosophy Majors and Minors may not take this course for credit towards their major or minor degree",
  ])("stays unknown: %j", (text) => {
    expect(classifyFragment(text).type).toBe("unknown");
  });
});

describe("node schema", () => {
  test("accepts the typed nodes; rejects bad values", () => {
    const ok: PrereqNode[] = [
      {
        type: "count",
        n: 2,
        subject: "ENGL",
        level: 200,
        text: "two 200-division English courses",
      },
      {
        type: "permission",
        who: "co-op coordinator",
        text: "permission of the co-op co-ordinator",
      },
      {
        type: "restriction",
        text: "Enrolled in the philosophy honours program",
      },
    ];
    for (const node of ok)
      expect(prereqNodeSchema.safeParse(node).success).toBe(true);
    expect(
      prereqNodeSchema.safeParse({ type: "count", n: 2, level: 250, text: "x" })
        .success,
    ).toBe(false);
    expect(
      prereqNodeSchema.safeParse({
        type: "permission",
        who: "faculty",
        text: "x",
      }).success,
    ).toBe(false);
  });
});

// ---------- overrides ----------

const BUS_312_TREE: PrereqNode = {
  type: "all",
  of: [
    { type: "course", code: "BUS 254", minGrade: "C-", concurrentOk: false },
    { type: "units", min: 45 },
  ],
};

function overridesCsv(
  rows: Record<string, string>[],
  columns: readonly string[] = PREREQ_OVERRIDE_COLUMNS,
) {
  return Papa.unparse({
    fields: [...columns],
    data: rows.map((r) => columns.map((c) => r[c] ?? "")),
  });
}

const row = (overrides: Record<string, string> = {}) => ({
  course_code: "BUS 312",
  override_text: "BUS 254 with a minimum grade of C- and 45 units.",
  reason: "Test fixture: replace the parsed tree.",
  source_url:
    "https://www.sfu.ca/students/calendar/2026/fall/courses/bus/312.html",
  override_json: JSON.stringify(BUS_312_TREE),
  ...overrides,
});

describe("parseOverridesCsv", () => {
  test("the committed template (header only) has no rows and no errors", () => {
    expect(parseOverridesCsv(`${PREREQ_OVERRIDE_COLUMNS.join(",")}\n`)).toEqual(
      { rows: [], errors: [] },
    );
  });

  test("parses a valid row, including a null override", () => {
    const { rows, errors } = parseOverridesCsv(
      overridesCsv([
        row(),
        row({ course_code: "BUS 303", override_json: "null" }),
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.course_code, r.override_json])).toEqual([
      ["BUS 312", BUS_312_TREE],
      ["BUS 303", null],
    ]);
  });

  test.each([
    [
      "invalid JSON",
      { override_json: "{type: all" },
      /override_json is not valid JSON/,
    ],
    ["empty JSON", { override_json: "" }, /override_json is empty/],
    [
      "unknown node type",
      { override_json: '{"type":"maybe","text":"x"}' },
      /override_json/,
    ],
    [
      "group with one child",
      { override_json: '{"type":"all","of":[{"type":"units","min":45}]}' },
      /override_json\.of/,
    ],
    [
      "malformed course code in the tree",
      {
        override_json:
          '{"type":"course","code":"BUS312","minGrade":null,"concurrentOk":false}',
      },
      /override_json\.code/,
    ],
    ["bad course_code", { course_code: "Bus 312" }, /course_code/],
    ["missing source_url", { source_url: "" }, /source_url/],
  ])("fails on %s", (_, change, message) => {
    const { rows, errors } = parseOverridesCsv(overridesCsv([row(change)]));
    expect(rows).toEqual([]);
    expect(errors.join("\n")).toMatch(message);
    expect(errors[0]).toMatch(/^prereq-overrides\.csv sheet row 2 /);
  });

  test("fails on a duplicate course_code and a missing column", () => {
    expect(parseOverridesCsv(overridesCsv([row(), row()])).errors).toEqual([
      "prereq-overrides.csv sheet row 3 (BUS 312): duplicate course_code, first on sheet row 2",
    ]);
    const noJson = overridesCsv([row()], PREREQ_OVERRIDE_COLUMNS.slice(0, 4));
    expect(parseOverridesCsv(noJson).errors[0]).toBe(
      "header: missing columns override_json",
    );
  });
});

describe("applyOverrides", () => {
  const records = [
    // A still-partial calendar string (REM 320W's text), under the override's course code.
    parsePrerequisites(
      "BUS 312",
      "45 units. Philosophy Majors and Minors may not take this course for credit towards their major or minor degree.",
      null,
    ),
    parsePrerequisites("BUS 303", "45 units.", null),
  ];
  const known = new Set(["BUS 312", "BUS 303"]);
  const { rows } = parseOverridesCsv(overridesCsv([row()]));

  test("replaces the parsed tree, recomputes status, marks the source", () => {
    expect(records[0]!.status).toBe("partial");
    const result = applyOverrides(records, rows, known);
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({
      code: "BUS 312",
      prereq: BUS_312_TREE,
      status: "parsed",
      source: "override",
      unparsed_fragments: [],
      raw: records[0]!.raw, // the calendar text is kept
    });
    expect(result.records[1]).toEqual(records[1]); // untouched
    expect(result.records[1]!.source).toBe("parsed");
  });

  test("a null override means no prerequisite", () => {
    const nullRows = parseOverridesCsv(
      overridesCsv([row({ override_json: "null" })]),
    ).rows;
    expect(applyOverrides(records, nullRows, known).records[0]).toMatchObject({
      prereq: null,
      status: "none",
      source: "override",
    });
  });

  test("fails on a course_code that isn't in courses.json", () => {
    const unknownRows = parseOverridesCsv(
      overridesCsv([row({ course_code: "BUS 999" })]),
    ).rows;
    const result = applyOverrides(records, unknownRows, known);
    expect(result.errors).toEqual([
      "prereq-overrides.csv: BUS 999 is not in courses.json",
    ]);
    expect(result.records).toEqual(records);
  });
});
