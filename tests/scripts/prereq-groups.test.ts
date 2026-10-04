import { describe, expect, test } from "vitest";
import {
  prereqNodeSchema,
  prereqRecordSchema,
  type PrereqNode,
} from "@/lib/data/prereqs";
import { parsePrerequisites } from "../../scripts/lib/prereqs";
import {
  classifyFragment,
  matchAltGroup,
} from "../../scripts/lib/prereqs/fragments";

// Real strings from data/generated/prereqs-review-requirements.json (2026-10-04).

const c = (
  code: string,
  minGrade: "C-" | "B-" | "B" | "A-" | "A" | "C" | null = null,
): PrereqNode => ({
  type: "course",
  code,
  minGrade,
  concurrentOk: false,
});
const units = (min: number): PrereqNode => ({ type: "units", min });
const all = (...of: PrereqNode[]): PrereqNode => ({ type: "all", of });
const any = (...of: PrereqNode[]): PrereqNode => ({ type: "any", of });
const alt = (group: string, text: string): PrereqNode => ({
  type: "alt_group",
  group,
  text,
});
const parse = (text: string) => {
  const record = parsePrerequisites("TEST 100", text, null);
  expect(prereqRecordSchema.safeParse(record).success).toBe(true);
  return record;
};

describe("alt_group: '; OR <student group> ...' clauses", () => {
  test("Data Science majors (BUS 362); counts as understood", () => {
    const r = parse(
      "BUS 237 with a minimum grade of C-; 45 units; OR Data Science majors with 45 units.",
    );
    expect(r.prereq).toEqual(
      any(
        all(c("BUS 237", "C-"), units(45)),
        alt("Data Science majors", "Data Science majors with 45 units"),
      ),
    );
    expect(r.status).toBe("parsed");
    expect(r.unparsed_fragments).toEqual([]);
  });

  test("business administration minor students (BUS 314)", () => {
    const r = parse(
      "BUS 238 or BUS 240, with a minimum grade of C- and 45 units; OR business administration minor students admitted Fall 2025 - onwards with BUS 240 with a minimum grade of C- and 45 units.",
    );
    expect(r.prereq).toEqual(
      any(
        all(any(c("BUS 238", "C-"), c("BUS 240", "C-")), units(45)),
        alt(
          "business administration minor students admitted Fall 2025 - onwards",
          "business administration minor students admitted Fall 2025 - onwards with BUS 240 with a minimum grade of C- and 45 units",
        ),
      ),
    );
  });

  test("joint major / data science / actuarial science students (BUS 217W)", () => {
    const r = parse(
      "BUS 201 with a minimum grade of C- and 15 units; OR 45 units and corequisite: BUS 202; OR business administration joint major, joint honours, or double degree students with 45 units; OR data science students with 15 units; OR actuarial science students with 15 units.",
    );
    expect(r.prereq).toEqual(
      any(
        all(c("BUS 201", "C-"), units(15)),
        all(units(45), {
          type: "course",
          code: "BUS 202",
          minGrade: null,
          concurrentOk: true,
        }),
        alt(
          "business administration joint major, joint honours, or double degree students",
          "business administration joint major, joint honours, or double degree students with 45 units",
        ),
        alt("data science students", "data science students with 15 units"),
        alt(
          "actuarial science students",
          "actuarial science students with 15 units",
        ),
      ),
    );
    expect(r.status).toBe("parsed");
  });
});

describe("alt_group inside a clause", () => {
  test("'45 units OR <group>' (BUS 361)", () => {
    expect(
      parse(
        "45 units OR business administration minor students admitted Fall 2025 - onwards with 45 units.",
      ).prereq,
    ).toEqual(
      any(
        units(45),
        alt(
          "business administration minor students admitted Fall 2025 - onwards",
          "business administration minor students admitted Fall 2025 - onwards with 45 units",
        ),
      ),
    );
  });

  test("next to a normal course; the trailing group grade stays on the course (BUS 450)", () => {
    expect(
      parse(
        "BUS 360W or innovation and entrepreneurship certificate students with an upper division Writing (W) course, with a minimum grade of C-; 60 units.",
      ).prereq,
    ).toEqual(
      all(
        any(
          c("BUS 360W", "C-"),
          alt(
            "innovation and entrepreneurship certificate students",
            "innovation and entrepreneurship certificate students with an upper division Writing (W) course, with a minimum grade of C-",
          ),
        ),
        units(60),
      ),
    );
  });

  test("next to an and-group with 'both with' (BUS 443)", () => {
    expect(
      parse(
        "BUS 343 and BUS 360W, or innovation and entrepreneurship certificate students with BUS 343 and an upper division Writing (W) course, both with a minimum grade of C-; 60 units.",
      ).prereq,
    ).toEqual(
      all(
        any(
          all(c("BUS 343", "C-"), c("BUS 360W", "C-")),
          alt(
            "innovation and entrepreneurship certificate students",
            "innovation and entrepreneurship certificate students with BUS 343 and an upper division Writing (W) course, both with a minimum grade of C-",
          ),
        ),
        units(60),
      ),
    );
  });

  test("parenthesized groups (BUS 453)", () => {
    const r = parse(
      "BUS 360W or (corporate environmental and social sustainability certificate students or innovation and entrepreneurship certificate students with an upper division Writing (W) course), with a minimum grade of C-; 60 units. Recommended: BUS 338.",
    );
    expect(r.prereq).toEqual(
      all(
        any(
          c("BUS 360W", "C-"),
          alt(
            "corporate environmental and social sustainability certificate students or innovation and entrepreneurship certificate students",
            "(corporate environmental and social sustainability certificate students or innovation and entrepreneurship certificate students with an upper division Writing (W) course), with a minimum grade of C-",
          ),
        ),
        units(60),
      ),
    );
  });

  test("admission cohorts on both sides; the separate grade clause stays unknown (BUS 473)", () => {
    const r = parse(
      "Students admitted prior to Fall 2023 with (BUS 373 or BUS 336) and BUS 360W, or students admitted Fall 2023 onward with BUS 373 and BUS 360W; both with a minimum grade of C-; 60 units.",
    );
    expect(r.prereq).toEqual(
      all(
        any(
          alt(
            "Students admitted prior to Fall 2023",
            "Students admitted prior to Fall 2023 with (BUS 373 or BUS 336) and BUS 360W",
          ),
          alt(
            "students admitted Fall 2023 onward",
            "students admitted Fall 2023 onward with BUS 373 and BUS 360W",
          ),
        ),
        { type: "unknown", text: "both with a minimum grade of C-" },
        units(60),
      ),
    );
    expect(r.status).toBe("partial");
  });
});

describe("matchAltGroup only knows the groups in the review file", () => {
  test.each([
    "Actuarial Science major or honours program, or STAT 270 with a minimum grade of C-", // STAT 180
    "students admitted to the business administration major",
    "Philosophy Majors and Minors may not take this course for credit",
  ])("not a group: %j", (text) => {
    expect(matchAltGroup(text)).toBeNull();
  });

  test("STAT 180 keeps its course path", () => {
    expect(
      parse(
        "Enrollment in the Statistics or Actuarial Science major or honours program, or STAT 270 with a minimum grade of C-.",
      ).prereq,
    ).toEqual(
      any(
        {
          type: "unknown",
          text: "Enrollment in the Statistics or Actuarial Science major or honours program",
        },
        c("STAT 270", "C-"),
      ),
    );
  });
});

describe("external: high school prerequisites", () => {
  test("Pre-Calculus 12 with a grade, as an alternative to SFU courses (MATH 150)", () => {
    const r = parse(
      "Pre-Calculus 12 (or equivalent) with a grade of at least B+, or MATH 100 with a grade of at least B-, or MATH 110 with a grade of at least A-.",
    );
    expect(r.prereq).toEqual(
      any(
        {
          type: "external",
          kind: "high_school",
          minGrade: "B+",
          text: "Pre-Calculus 12 (or equivalent) with a grade of at least B+",
        },
        c("MATH 100", "B-"),
        c("MATH 110", "A-"),
      ),
    );
    expect(r.status).toBe("parsed");
  });

  test.each([
    ["Pre-Calculus 12 (or equivalent) with a grade of at least A", "A"], // MATH 151
    ["Pre-Calculus 12 (or equivalent) with a grade of at least B", "B"], // MATH 154, 157
    [
      "Pre-Calculus 12 or Foundations of Mathematics 12 (or equivalent) with a grade of at least B",
      "B",
    ], // MATH 130
  ])("%j", (text, minGrade) => {
    expect(classifyFragment(text)).toEqual({
      type: "external",
      kind: "high_school",
      minGrade,
      text,
    });
  });

  test("no grade stated -> no minGrade", () => {
    expect(classifyFragment("Pre-Calculus 12 (or equivalent)")).toEqual({
      type: "external",
      kind: "high_school",
      text: "Pre-Calculus 12 (or equivalent)",
    });
  });

  test.each([
    // MATH 100: several credentials and FAN credit in one phrase
    "Pre-Calculus 11 or Foundations of Mathematics 11 (or equivalent) with a grade of at least B or Pre-Calculus 12 (or equivalent), with a grade of at least C and SFU FAN credit, or SFU FAN X92 or FAN X99 course with a grade of at least B-",
    "SFU FAN X92 or X99 course with a grade of at least B-",
  ])("other wording stays unknown: %j", (text) => {
    expect(classifyFragment(text).type).toBe("unknown");
  });
});

describe("schema", () => {
  test("accepts alt_group and external; rejects other external kinds", () => {
    expect(
      prereqNodeSchema.safeParse(
        alt("Data Science majors", "Data Science majors with 45 units"),
      ).success,
    ).toBe(true);
    expect(
      prereqNodeSchema.safeParse({
        type: "external",
        kind: "high_school",
        minGrade: "B+",
        text: "x",
      }).success,
    ).toBe(true);
    expect(
      prereqNodeSchema.safeParse({
        type: "external",
        kind: "college",
        text: "x",
      }).success,
    ).toBe(false);
  });
});
