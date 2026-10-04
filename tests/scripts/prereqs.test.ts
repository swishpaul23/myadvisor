import { describe, expect, test } from "vitest";
import { prereqRecordSchema, type PrereqNode } from "@/lib/data/prereqs";
import { parsePrerequisites } from "../../scripts/lib/prereqs";
import { lex } from "../../scripts/lib/prereqs/lexer";
import {
  codesWithoutData,
  fragmentPattern,
  topFragments,
} from "../../scripts/lib/prereqs/report";

// Real prerequisite strings copied from data/generated/courses.json (SFU outlines).

type Grade = "C-" | "B-" | "B" | "B+" | "A-" | "A" | "C" | "P" | null;
const c = (
  code: string,
  minGrade: Grade = null,
  concurrentOk = false,
): PrereqNode => ({
  type: "course",
  code,
  minGrade,
  concurrentOk,
});
const all = (...of: PrereqNode[]): PrereqNode => ({ type: "all", of });
const any = (...of: PrereqNode[]): PrereqNode => ({ type: "any", of });
const units = (
  min: number,
  extra: { level?: "upper" | "lower"; subject?: string } = {},
): PrereqNode => ({
  type: "units",
  min,
  ...extra,
});
const q = (text: string): PrereqNode => ({ type: "unknown", text });
const restriction = (text: string): PrereqNode => ({
  type: "restriction",
  text,
});
const permission = (
  who: "instructor" | "department" | "co-op coordinator",
  text: string,
): PrereqNode => ({ type: "permission", who, text });
const count = (n: number, level: number, text: string): PrereqNode => ({
  type: "count",
  n,
  subject: "ENGL",
  level,
  text,
});
const parse = (pre: string | null, co: string | null = null) => {
  const record = parsePrerequisites("TEST 100", pre, co);
  expect(prereqRecordSchema.safeParse(record).success).toBe(true);
  return record;
};

describe("simple shapes", () => {
  test("empty text -> none", () => {
    expect(parse("")).toMatchObject({
      prereq: null,
      coreq: null,
      status: "none",
    });
    expect(parse(null)).toMatchObject({ status: "none", raw: "" });
  });

  test.each([
    ["12 units.", units(12)], // BUS 237
    ["45 units.", units(45)], // BUS 303
    ["A minimum of 45 units.", units(45)], // GEOG 333
    ["At least 60 units.", units(60)], // PHIL 300
    ["42 units.", units(42)], // REM 350
  ])("%j", (text, node) => {
    expect(parse(text)).toMatchObject({ prereq: node, status: "parsed" });
  });

  test("upper division subject units (PHIL 421), recommendation kept apart", () => {
    const r = parse(
      "Nine upper division PHIL units. It is strongly recommended that students in PHIL 421 have taken prior courses in moral theory (e.g., PHIL 120W, PHIL 221, PHIL 270, PHIL 320, PHIL 321, PHIL 322, PHIL 326, or PHIL 329).",
    );
    expect(r.prereq).toEqual(units(9, { level: "upper", subject: "PHIL" }));
    expect(r.status).toBe("parsed");
    expect(r.advisory).toHaveLength(1);
  });

  test("single course (ENGL 400W)", () => {
    expect(parse("ENGL 300.").prereq).toEqual(c("ENGL 300"));
  });
});

describe("grades", () => {
  test("course; units (BUS 254)", () => {
    expect(
      parse("BUS 251 with a minimum grade of C-; 15 units.").prereq,
    ).toEqual(all(c("BUS 251", "C-"), units(15)));
  });

  test("group grade with 'all with' over and-list with inner ors (BUS 207)", () => {
    expect(
      parse(
        "ECON 103 or ECON 113, ECON 105 or ECON 115, MATH 157, all with a minimum grade of C-; 15 units.",
      ).prereq,
    ).toEqual(
      all(
        any(c("ECON 103", "C-"), c("ECON 113", "C-")),
        any(c("ECON 105", "C-"), c("ECON 115", "C-")),
        c("MATH 157", "C-"),
        units(15),
      ),
    );
  });

  test("'all with ... and 45 units' (BUS 313)", () => {
    expect(
      parse(
        "BUS 312, BUS 207 or ECON 201, all with a minimum grade of C- and 45 units.",
      ).prereq,
    ).toEqual(
      all(
        c("BUS 312", "C-"),
        any(c("BUS 207", "C-"), c("ECON 201", "C-")),
        units(45),
      ),
    );
  });

  test("grade per course (ECON 201)", () => {
    expect(
      parse(
        "ECON 103 with a minimum grade of C- or ECON 113 with a minimum grade of B-; ECON 105 with a minimum grade of C- or ECON 115 with a minimum grade of B-; MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-.",
      ).prereq,
    ).toEqual(
      all(
        any(c("ECON 103", "C-"), c("ECON 113", "B-")),
        any(c("ECON 105", "C-"), c("ECON 115", "B-")),
        any(
          c("MATH 150", "C-"),
          c("MATH 151", "C-"),
          c("MATH 154", "C-"),
          c("MATH 157", "C-"),
        ),
      ),
    );
  });

  test("P grade on a group, then another course (BUS 300)", () => {
    const r = parse(
      "This course is only open to approved business administration majors admitted to the faculty in Fall 2022 and onward. BUS 100 or BUS 203, with a P grade and BUS 217W with a minimum grade of C-; 45 units. Recommendation to take with BUS 360W.",
    );
    expect(r.prereq).toEqual(
      all(
        restriction(
          "This course is only open to approved business administration majors admitted to the faculty in Fall 2022 and onward",
        ),
        any(c("BUS 100", "P"), c("BUS 203", "P")),
        c("BUS 217W", "C-"),
        units(45),
      ),
    );
    // A restriction is recognized text, not an unknown, so the parse is complete.
    expect(r.status).toBe("parsed");
    expect(r.advisory).toEqual(["Recommendation to take with BUS 360W"]);
  });

  test("'with a grade of at least' and 'both with a grade of at least' (MATH 232)", () => {
    expect(
      parse(
        "MATH 150 or 151 or MACM 101, with a minimum grade of C-; or MATH 154 or 157, both with a grade of at least B.",
      ).prereq,
    ).toEqual(
      any(
        c("MATH 150", "C-"),
        c("MATH 151", "C-"),
        c("MACM 101", "C-"),
        c("MATH 154", "B"),
        c("MATH 157", "B"),
      ),
    );
  });

  test("grade on the last course only is unclear (MATH 242)", () => {
    const r = parse(
      "MATH 152 with a minimum grade of C-; or MATH 155 or 158 with a grade of B.",
    );
    expect(r.prereq).toEqual(
      any(c("MATH 152", "C-"), q("MATH 155 or 158 with a grade of B")),
    );
    expect(r.status).toBe("partial");
  });
});

describe("and/or precedence and parentheses", () => {
  test("nested and/or with parentheses, unknown alternative, recommendation (BUS 312)", () => {
    const r = parse(
      "BUS 254 and (BUS 232 or ECON 233 or STAT 270 or STAT 271), both with a minimum grade of C- and 45 units; OR actuarial science students with BUS 254 and (BUS 232 or ECON 233 or STAT 270 or STAT 271), both with a minimum grade of C- and 45 units. Recommended: BUS 207 or ECON 201.",
    );
    expect(r.prereq).toEqual(
      any(
        all(
          c("BUS 254", "C-"),
          any(
            c("BUS 232", "C-"),
            c("ECON 233", "C-"),
            c("STAT 270", "C-"),
            c("STAT 271", "C-"),
          ),
          units(45),
        ),
        q(
          "actuarial science students with BUS 254 and (BUS 232 or ECON 233 or STAT 270 or STAT 271), both with a minimum grade of C- and 45 units",
        ),
      ),
    );
    expect(r.advisory).toEqual(["Recommended: BUS 207 or ECON 201"]);
    expect(r.status).toBe("partial");
  });

  test("'(or X)' alternatives (BUS 331)", () => {
    expect(
      parse("BUS 330 (or BUS 329) with a minimum grade of C-, 45 units.")
        .prereq,
    ).toEqual(all(any(c("BUS 330", "C-"), c("BUS 329", "C-")), units(45)));
  });

  test("'(or A and B)', inline corequisite, extra sentence (BUS 401)", () => {
    const r = parse(
      "BUS 311 (or BUS 254 and BUS 312), BUS 341, and corequisite BUS 340, all with a minimum grade of C-; 60 units. The course is only open to students in the business minor program.",
    );
    expect(r.prereq).toEqual(
      all(
        any(c("BUS 311", "C-"), all(c("BUS 254", "C-"), c("BUS 312", "C-"))),
        c("BUS 341", "C-"),
        c("BUS 340", "C-", true),
        units(60),
        restriction(
          "The course is only open to students in the business minor program",
        ),
      ),
    );
  });

  test("'and one of', bare numbers (BUS 432)", () => {
    expect(
      parse(
        "BUS 360W and one of BUS 272 or 381, all with a minimum grade of C-; 60 units. Recommended: BUS 346.",
      ).prereq,
    ).toEqual(
      all(
        c("BUS 360W", "C-"),
        any(c("BUS 272", "C-"), c("BUS 381", "C-")),
        units(60),
      ),
    );
  });

  test("'either' (BUS 478)", () => {
    expect(
      parse(
        "BUS 207 (or ECON 201 or ECON 301), BUS 312, 343, 360W and either BUS 374 or 381, all with a minimum grade of C-; 90 units.",
      ).prereq,
    ).toEqual(
      all(
        any(c("BUS 207", "C-"), c("ECON 201", "C-"), c("ECON 301", "C-")),
        c("BUS 312", "C-"),
        c("BUS 343", "C-"),
        c("BUS 360W", "C-"),
        any(c("BUS 374", "C-"), c("BUS 381", "C-")),
        units(90),
      ),
    );
  });

  test("mid-segment 'one of' continuing across commas (ECON 332)", () => {
    expect(
      parse(
        "ECON 201 and one of ECON 233, STAT 270, or STAT 271. Recommended: ECON 305.",
      ).prereq,
    ).toEqual(
      all(c("ECON 201"), any(c("ECON 233"), c("STAT 270"), c("STAT 271"))),
    );
  });

  test("'or all of:' (STAT 380)", () => {
    expect(
      parse(
        "STAT 330, or all of: STAT 285, MATH 208W, and MATH 251, all with a minimum grade of C-.",
      ).prereq,
    ).toEqual(
      any(
        c("STAT 330", "C-"),
        all(c("STAT 285", "C-"), c("MATH 208W", "C-"), c("MATH 251", "C-")),
      ),
    );
  });

  test("nested 'one of ... or one of' (MATH 314)", () => {
    expect(
      parse(
        "MATH 260 or MATH 310, with a minimum grade of C-; and one of MATH 251 with a grade of B+, or one of MATH 252 or 254, with a minimum grade of C-.",
      ).prereq,
    ).toEqual(
      all(
        any(c("MATH 260", "C-"), c("MATH 310", "C-")),
        any(c("MATH 251", "B+"), c("MATH 252", "C-"), c("MATH 254", "C-")),
      ),
    );
  });

  test("dept alias 'ECON (or BUEC) 333' and '(or BUEC 333)' (ECON 480, ECON 434)", () => {
    expect(
      parse("ECON (or BUEC) 333 with a minimum grade of C-.").prereq,
    ).toEqual(any(c("ECON 333", "C-"), c("BUEC 333", "C-")));
    expect(
      parse(
        "ECON 333 (or BUEC 333) and ECON 302, all with a minimum grade of C-.",
      ).prereq,
    ).toEqual(
      all(any(c("ECON 333", "C-"), c("BUEC 333", "C-")), c("ECON 302", "C-")),
    );
  });

  test("'; or' chain with bare numbers (ENGL 272)", () => {
    expect(
      parse("ENGL 111W, 112W, 113W, 114W, or 115W; or WL 105W; or PUB 101.")
        .prereq,
    ).toEqual(
      any(
        c("ENGL 111W"),
        c("ENGL 112W"),
        c("ENGL 113W"),
        c("ENGL 114W"),
        c("ENGL 115W"),
        c("WL 105W"),
        c("PUB 101"),
      ),
    );
  });

  test("'; OR' alternatives with unknown student groups (BUS 217W)", () => {
    const r = parse(
      "BUS 201 with a minimum grade of C- and 15 units; OR 45 units and corequisite: BUS 202; OR business administration joint major, joint honours, or double degree students with 45 units; OR data science students with 15 units; OR actuarial science students with 15 units.",
    );
    expect(r.prereq).toEqual(
      any(
        all(c("BUS 201", "C-"), units(15)),
        all(units(45), c("BUS 202", null, true)),
        q(
          "business administration joint major, joint honours, or double degree students with 45 units",
        ),
        q("data science students with 15 units"),
        q("actuarial science students with 15 units"),
      ),
    );
  });

  test("mixed and/or without commas or parentheses is unknown (ECON 398)", () => {
    const r = parse(
      "ECON 103 or 200 and ECON 105 or 205, all with a minimum grade of C-; 45 units.",
    );
    expect(r.prereq).toEqual(
      all(
        q(
          "ECON 103 or 200 and ECON 105 or 205, all with a minimum grade of C-",
        ),
        units(45),
      ),
    );
  });

  test("grade in the middle of an or-list is unknown (ECON 222)", () => {
    const r = parse(
      "ECON 103, MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-, or ECON 113 with a minimum grade of A-.",
    );
    expect(r.status).toBe("unparsed");
    expect(r.unparsed_fragments).toHaveLength(1);
  });

  test("'A; or B; C' is unknown (MATH 260)", () => {
    const r = parse(
      "MATH 152 with a minimum grade of C-; or MATH 155 or 158, with a grade of at least B; MATH 232 or 240, with a minimum grade of C-.",
    );
    expect(r.status).toBe("unparsed");
  });

  test("', OR' in a sentence with semicolons is unknown as a whole (BUS 360W)", () => {
    const r = parse(
      "This course is open to students admitted to the business administration major, honours, or second degree program and who have 45 units and BUS 130 or (BUS 201 or BUS 202) or BUS 301, and BUS 217W, both with a minimum grade of C-, OR to students admitted Fall 2022 onwards to the business administration major, honours, or second degree program, and who have 45 units; BUS 217W and (BUS 201 or BUS 202), both with a minimum grade of C-; and BUS 300, OR to data science major with BUS 217W with a minimum grade of C- and 45 units.",
    );
    expect(r.status).toBe("unparsed");
  });
});

describe("units with courses", () => {
  test("'including' (INDG 325)", () => {
    expect(
      parse("45 units including INDG (or FNST) 101 or 201W.").prereq,
    ).toEqual(
      all(units(45), any(c("INDG 101"), c("FNST 101"), c("INDG 201W"))),
    );
  });

  test("subject units (PHIL 310)", () => {
    expect(
      parse(
        "One of PHIL 110, 210, 314, 315, or MACM 101; or a minimum of 12 units in MATH.",
      ).prereq,
    ).toEqual(
      any(
        c("PHIL 110"),
        c("PHIL 210"),
        c("PHIL 314"),
        c("PHIL 315"),
        c("MACM 101"),
        units(12, { subject: "MATH" }),
      ),
    );
  });

  test("units or words (ENGL 202)", () => {
    expect(
      parse("12 units or one 100-division English course.").prereq,
    ).toEqual(any(units(12), count(1, 100, "one 100-division English course")));
  });
});

describe("permission, admission, and other rules", () => {
  test("'or permission of the instructor' with 'one of' (INDG 401)", () => {
    expect(
      parse(
        "45 units, INDG (or FNST) 101 and one of INDG (or FNST) 201W or 250, or permission of the instructor.",
      ).prereq,
    ).toEqual(
      any(
        all(
          units(45),
          any(c("INDG 101"), c("FNST 101")),
          any(c("INDG 201W"), c("FNST 201W"), c("INDG 250")),
        ),
        permission("instructor", "permission of the instructor"),
      ),
    );
  });

  test("'and permission of' (MATH 337)", () => {
    expect(
      parse(
        "MATH 336 and permission of the co-op co-ordinator; students must apply at least one term in advance.",
      ).prereq,
    ).toEqual(
      all(
        c("MATH 336"),
        permission("co-op coordinator", "permission of the co-op co-ordinator"),
        q("students must apply at least one term in advance"),
      ),
    );
  });

  test("'Permission of ... and' at the start (BUS 498)", () => {
    expect(
      parse(
        "Permission of the faculty and BUS 360W with a minimum grade of C-; 60 units.",
      ).prereq,
    ).toEqual(
      all(q("Permission of the faculty"), c("BUS 360W", "C-"), units(60)),
    );
  });

  test("text that matches no pattern is unparsed (ECON 383)", () => {
    const text =
      "To be determined by the instructor subject to approval by the department chair";
    const r = parse(`${text}.`);
    expect(r.status).toBe("unparsed");
    expect(r.prereq).toEqual(q(text));
  });

  test.each([
    ["Enrolled in the philosophy honours program"], // PHIL 479
    ["Reserved for English honours, major, joint major and minor students"], // ENGL 418W
  ])("program/admission restriction: %j", (text) => {
    const r = parse(`${text}.`);
    expect(r.prereq).toEqual(restriction(text));
    expect(r.unparsed_fragments).toEqual([]);
  });

  test("CGPA and substitution sentences stay verbatim (ECON 402)", () => {
    const r = parse(
      "ECON 302 and 331, with a minimum grade of C-. Students who have completed both MATH 232 and 251 may substitute these courses for ECON 331. Entry into this course requires a minimum CGPA of 3.0 or permission of the department.",
    );
    expect(r.unparsed_fragments).toEqual([
      "Students who have completed both MATH 232 and 251 may substitute these courses for ECON 331",
      "Entry into this course requires a minimum CGPA of 3.0 or permission of the department",
    ]);
  });

  test("courses in policy sentences are not lifted out (ECON 333)", () => {
    const r = parse(
      "ECON 233, BUS (or BUEC) 232, STAT 270, or STAT 271, with a minimum grade of C-. Students with a minimum grade of A- in ECON 233, BUS (or BUEC) 232, STAT 270, or STAT 271 can take ECON 333 after 30 units.",
    );
    expect(r.prereq).toEqual(
      all(
        any(
          c("ECON 233", "C-"),
          c("BUS 232", "C-"),
          c("BUEC 232", "C-"),
          c("STAT 270", "C-"),
          c("STAT 271", "C-"),
        ),
        q(
          "Students with a minimum grade of A- in ECON 233, BUS (or BUEC) 232, STAT 270, or STAT 271 can take ECON 333 after 30 units",
        ),
      ),
    );
  });

  test("cannot-take credit rule stays unknown (REM 320W)", () => {
    const r = parse(
      "45 units. Philosophy Majors and Minors may not take this course for credit towards their major or minor degree.",
    );
    expect(r.prereq).toEqual(
      all(
        units(45),
        q(
          "Philosophy Majors and Minors may not take this course for credit towards their major or minor degree",
        ),
      ),
    );
  });
});

describe("corequisites and concurrency", () => {
  test("admission sentence + 'Corequisite: X with a P grade' (BUS 201)", () => {
    const r = parse(
      "This course is only open to approved business administration majors admitted to the faculty through the Business Foundation Pathways - High School Pathway. Corequisite: BUS 203 with a P grade.",
    );
    expect(r.prereq).toEqual(
      restriction(
        "This course is only open to approved business administration majors admitted to the faculty through the Business Foundation Pathways - High School Pathway",
      ),
    );
    expect(r.coreq).toEqual(c("BUS 203", "P", true));
    expect(r.status).toBe("parsed");
  });

  test("'may be taken concurrently' marks the courses (ECON 233)", () => {
    expect(
      parse(
        "MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-; 15 units. MATH 150, MATH 151, MATH 154, or MATH 157 may be taken concurrently with ECON 233.",
      ).prereq,
    ).toEqual(
      all(
        any(
          c("MATH 150", "C-", true),
          c("MATH 151", "C-", true),
          c("MATH 154", "C-", true),
          c("MATH 157", "C-", true),
        ),
        units(15),
      ),
    );
  });

  test("corequisite sentence, concurrency, and an unknown unit limit (ECON 220W)", () => {
    const r = parse(
      "ECON 201 with a minimum grade of C-, minimum 30 units and no more than 80 units. Corequisite: ECON 201, with a minimum grade of C-. ECON 201 may be taken prior to or concurrently with ECON 220W.",
    );
    expect(r.prereq).toEqual(
      all(
        c("ECON 201", "C-", true),
        q("minimum 30 units and no more than 80 units"),
      ),
    );
    expect(r.coreq).toEqual(c("ECON 201", "C-", true));
  });

  test("'Corequisite: X may be taken as a corequisite' (MATH 468)", () => {
    const r = parse(
      "MATH 360 and (MATH 348 or STAT 380), both with a minimum grade of C-. Corequisite: MATH 348 or STAT 380 may be taken as a corequisite. Strongly Recommended: Experience with a computing platform such as R, MATLAB, or Python.",
    );
    expect(r.prereq).toEqual(
      all(
        c("MATH 360", "C-"),
        any(c("MATH 348", "C-", true), c("STAT 380", "C-", true)),
      ),
    );
    expect(r.status).toBe("parsed");
  });

  test("'or Corequisite:' = prerequisite or corequisite (INDG 210)", () => {
    expect(parse("or Corequisite: INDG 101 or INDG 201W.").prereq).toEqual(
      any(c("INDG 101", null, true), c("INDG 201W", null, true)),
    );
  });

  test("corequisites_text column (BUS 232)", () => {
    const r = parse(
      "",
      "MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-; 15 units.",
    );
    expect(r.prereq).toBeNull();
    expect(r.coreq).toEqual(
      all(
        any(
          c("MATH 150", "C-", true),
          c("MATH 151", "C-", true),
          c("MATH 154", "C-", true),
          c("MATH 157", "C-", true),
        ),
        units(15),
      ),
    );
    expect(r.raw_coreq).toBe(
      "MATH 150, MATH 151, MATH 154, or MATH 157, with a minimum grade of C-; 15 units.",
    );
    expect(r.status).toBe("parsed");
  });

  test("recommendation-only text -> none (INDG 286, STAT 270 advice)", () => {
    expect(parse("Recommended: INDG 101.")).toMatchObject({
      prereq: null,
      status: "none",
    });
    const r = parse(
      "or Corequisite: MATH 152 or 155 or 158, with a minimum grade of C-. Students wishing an intuitive appreciation of a broad range of statistical strategies may wish to take STAT 100 first.",
    );
    expect(r.status).toBe("parsed");
    expect(r.advisory).toHaveLength(1);
  });
});

describe("lexer", () => {
  test("bare numbers take the previous department; '100-division' is not a course", () => {
    const kinds = lex("BUS 315, 360W or one 100-division course").map((t) =>
      t.kind === "course" ? t.codes.join("|") : t.kind,
    );
    expect(kinds).toEqual([
      "BUS 315",
      "comma",
      "BUS 360W",
      "or",
      "word",
      "word",
      "word",
    ]);
  });
});

describe("report", () => {
  const records = [
    parse("45 units or permission of the undergraduate chair."),
    parse("45 units or permission of the undergraduate chair."),
    parse("Admission is by permission of the Instructor and Director."),
    parse("CMPT 120 and XYZ 101."),
  ];

  test("fragment patterns", () => {
    expect(fragmentPattern("permission of the instructor")).toBe(
      "permission or approval",
    );
    expect(fragmentPattern("A minimum CGPA of 3.0")).toBe("GPA");
    expect(fragmentPattern("Enrolled in the philosophy honours program")).toBe(
      "admission or program restriction",
    );
    expect(fragmentPattern("two 200-division English courses")).toBe(
      "course count by level or subject",
    );
    expect(fragmentPattern("something else")).toBe("other");
  });

  test("most common fragments first", () => {
    expect(topFragments(records, 1)).toEqual([
      {
        text: "permission of the undergraduate chair",
        count: 2,
        pattern: "permission or approval",
      },
    ]);
  });

  test("codes without course data", () => {
    expect(codesWithoutData(records, new Set(["CMPT 120"]))).toEqual({
      "XYZ 101": ["TEST 100"],
    });
  });
});
