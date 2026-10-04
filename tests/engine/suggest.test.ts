import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { suggestNextTerm, type Suggestion } from "@/engine/plan/suggest";
import type { PlanCatalog } from "@/engine/plan/types";
import { demoStudent } from "./fixtures/demo-student";
import {
  expectedDemo,
  expectedSynthetic,
  type ExpectedSuggestion,
} from "./fixtures/suggest.expected";
import { catalog, course, realCatalog, row, student, took } from "./helpers";

// suggestNextTerm() tests, written with hand-computed expectations before
// src/engine/plan/suggest.ts existed.

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const real: PlanCatalog = {
  ...realCatalog(),
  offerings: json("data/generated/offerings.json") as Record<
    string,
    CourseOfferings
  >,
  prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
};

function shape(s: Suggestion): ExpectedSuggestion {
  const term = s.validation.terms[0];
  return {
    courses: s.courses,
    openSlots: s.openSlots,
    skipped: s.skipped,
    violations: s.validation.violations.map(
      (v) => `${v.severity} ${v.code} ${v.courseCode ?? "-"} ${v.termId}`,
    ),
    units: term?.units ?? null,
    cumulativeUnits: term?.cumulativeUnits ?? null,
  };
}

describe("suggestNextTerm: demo student, 2027-spring (hand-computed)", () => {
  test.each([
    ["load4", 4],
    ["load2", 2],
    ["load6", 6],
  ] as const)("%s", (key, courseLoad) => {
    const s = suggestNextTerm(demoStudent, real, {
      termId: "2027-spring",
      courseLoad,
    });
    expect(s.termId).toBe("2027-spring");
    expect(shape(s)).toEqual(expectedDemo[key]);
  });

  test("the validated plan is exactly the chosen courses in one study term", () => {
    const s = suggestNextTerm(demoStudent, real, {
      termId: "2027-spring",
      courseLoad: 4,
    });
    expect(s.plan).toEqual({
      terms: [
        {
          id: "2027-spring",
          kind: "study",
          courses: ["BUS 373", "BUS 313", "BUS 315"],
        },
      ],
    });
  });

  test("deterministic: same input, same output", () => {
    const a = suggestNextTerm(demoStudent, real, {
      termId: "2027-spring",
      courseLoad: 4,
    });
    const b = suggestNextTerm(demoStudent, real, {
      termId: "2027-spring",
      courseLoad: 4,
    });
    expect(a).toEqual(b);
  });
});

describe("suggestNextTerm: synthetic catalog (hand-computed)", () => {
  const one = (req_id: string, ...courses: string[]) =>
    row({ req_id, courses });
  const rows = [
    one("r1", "AAA 101"),
    one("r2", "AAA 201"),
    one("r3", "AAA 102", "AAA 103"),
    one("r4", "AAA 301"),
    one("r5", "AAA 101"),
    one("r6", "AAA 104"),
    one("r7", "AAA 105"),
    row({
      req_id: "r8",
      rule: "n courses",
      n_or_units: 1,
      courses: ["AAA 106", "AAA 107"],
    }),
    one("r9", "AAA 108"),
  ];
  const codes = [
    "AAA 101",
    "AAA 102",
    "AAA 103",
    "AAA 104",
    "AAA 105",
    "AAA 106",
    "AAA 107",
    "AAA 108",
    "AAA 201",
    "AAA 301",
  ];
  // Cast as the real data is: an object literal can't satisfy the index signature and `future`.
  const fall = {
    "2025-fall": ["LEC"],
    future: {},
  } as unknown as CourseOfferings;
  const spring = {
    "2025-spring": ["LEC"],
    future: {},
  } as unknown as CourseOfferings;
  const offerings: Record<string, CourseOfferings> = Object.fromEntries(
    codes.map((c) => [c, c === "AAA 301" ? spring : fall]),
  );
  const record = (
    code: string,
    prereq: PrereqRecord["prereq"],
  ): PrereqRecord => ({
    code,
    prereq,
    coreq: null,
    status: prereq ? "parsed" : "none",
    source: "parsed",
    raw: "",
    raw_coreq: null,
    advisory: [],
    unparsed_fragments: [],
  });
  const prereqs: PrereqRecord[] = [
    ...codes
      .filter((c) => !["AAA 201", "AAA 105", "AAA 108"].includes(c))
      .map((c) => record(c, null)),
    {
      ...record("AAA 201", {
        type: "unknown",
        text: "Interview with the chair.",
      }),
      status: "unparsed",
    },
    record("AAA 105", {
      type: "course",
      code: "AAA 101",
      minGrade: "C-",
      concurrentOk: false,
    }),
    record("AAA 108", {
      type: "permission",
      who: "instructor",
      text: "Permission of the instructor.",
    }),
  ];
  const synthetic: PlanCatalog = {
    ...catalog(
      rows,
      codes.map((c) => course(c, 3)),
    ),
    offerings,
    prereqs,
  };
  const s = student([took("AAA 104", "B")]);

  test("chosen, skipped and open slots", () => {
    const result = suggestNextTerm(s, synthetic, {
      termId: "2026-fall",
      courseLoad: 3,
    });
    expect(shape(result)).toEqual(expectedSynthetic);
  });

  test("no candidates at all: every slot is open, nothing to validate", () => {
    const done = student(codes.map((c) => took(c, "A")));
    const result = suggestNextTerm(done, synthetic, {
      termId: "2026-fall",
      courseLoad: 4,
    });
    expect(result.courses).toEqual([]);
    expect(result.openSlots).toBe(4);
    expect(result.plan.terms[0]!.courses).toEqual([]);
  });
});
