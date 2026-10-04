import { describe, expect, test } from "vitest";
import type { PrereqNode } from "@/lib/data/prereqs";
import { evaluateNode, type PrereqContext } from "@/engine/prereqs/evaluate";
import { policy } from "./helpers";

// Evaluator tests (written before src/engine/prereqs/evaluate.ts). docs/validator-spec.md §2.

const c = (
  code: string,
  minGrade: string | null = null,
  concurrentOk = false,
): PrereqNode =>
  ({ type: "course", code, minGrade, concurrentOk }) as PrereqNode;
const all = (...of: PrereqNode[]): PrereqNode => ({ type: "all", of });
const any = (...of: PrereqNode[]): PrereqNode => ({ type: "any", of });
const unknownNode: PrereqNode = { type: "unknown", text: "something unclear" };

function ctx(partial: Partial<PrereqContext> = {}): PrereqContext {
  return {
    policy: policy(),
    completed: new Map(),
    earlier: new Set(),
    sameTerm: new Set(),
    passedBefore: [],
    student: { program: "BBA", admissionTerm: "2024-fall" },
    declarations: {},
    ...partial,
  };
}
const truth = (
  node: PrereqNode,
  context = ctx(),
  mode: "prereq" | "coreq" = "prereq",
) => evaluateNode(node, context, mode).truth;

describe("Kleene logic", () => {
  const met = c("BUS 201");
  const unmet = c("BUS 999");
  const context = ctx({ completed: new Map([["BUS 201", "B"]]) });
  test.each([
    ["all(met, met)", all(met, met), "met"],
    ["all(met, unknown)", all(met, unknownNode), "unknown"],
    ["all(unmet, unknown)", all(unmet, unknownNode), "unmet"],
    ["any(unmet, unknown)", any(unmet, unknownNode), "unknown"],
    ["any(met, unknown)", any(met, unknownNode), "met"],
    ["any(unmet, unmet)", any(unmet, c("BUS 998")), "unmet"],
  ])("%s -> %s", (_, node, expected) => {
    expect(truth(node, context)).toBe(expected);
  });
});

describe("course nodes and grades", () => {
  test("letter minimum; P and CR meet any minimum", () => {
    const done = ctx({
      completed: new Map([
        ["BUS 312", "C"],
        ["BUS 251", "D"],
        ["BUS 300", "P"],
        ["BUS 272", "P"],
        ["ECON 105", "CR"],
      ]),
    });
    expect(truth(c("BUS 312", "C-"), done)).toBe("met");
    expect(truth(c("BUS 251", "C-"), done)).toBe("unmet");
    expect(truth(c("BUS 300", "C-"), done)).toBe("met"); // pass/fail course
    expect(truth(c("BUS 272", "C-"), done)).toBe("met"); // P meets any minimum
    expect(truth(c("ECON 105", "C-"), done)).toBe("met"); // ASSUMPTION
  });

  test("a D followed by a planned retake counts as met, with a note", () => {
    const r = evaluateNode(
      c("BUS 251", "C-"),
      ctx({
        completed: new Map([["BUS 251", "D"]]),
        earlier: new Set(["BUS 251"]),
      }),
      "prereq",
    );
    expect(r.truth).toBe("met");
    expect(r.notes.join(" ")).toMatch(/assumes a grade of at least C-/);
  });

  test("same term: only concurrentOk courses, or any course in coreq mode", () => {
    const same = ctx({ sameTerm: new Set(["MATH 152"]) });
    expect(truth(c("MATH 152", "C-", true), same)).toBe("met");
    expect(truth(c("MATH 152", "C-", false), same)).toBe("unmet");
    expect(truth(c("MATH 152", "C-", false), same, "coreq")).toBe("met");
  });
});

describe("units and count", () => {
  const passed = [
    { code: "BUS 303", dept: "BUS", number: 303, units: 3 },
    { code: "BUS 360W", dept: "BUS", number: 360, units: 4 },
    { code: "ECON 103", dept: "ECON", number: 103, units: 4 },
    { code: "ENGL 214", dept: "ENGL", number: 214, units: 3 },
    { code: "ENGL 216", dept: "ENGL", number: 216, units: 3 },
  ];
  const context = ctx({ passedBefore: passed });

  test("units with level and subject", () => {
    expect(truth({ type: "units", min: 17 }, context)).toBe("met");
    expect(truth({ type: "units", min: 18 }, context)).toBe("unmet");
    expect(
      truth({ type: "units", min: 7, level: "upper", subject: "BUS" }, context),
    ).toBe("met");
    expect(truth({ type: "units", min: 8, level: "upper" }, context)).toBe(
      "unmet",
    );
  });

  test("units unknown when a course of unknown units could close the gap", () => {
    const c2 = ctx({
      passedBefore: [
        ...passed,
        { code: "ZZZ 101", dept: "ZZZ", number: 101, units: null },
      ],
    });
    expect(truth({ type: "units", min: 18 }, c2)).toBe("unknown");
  });

  test("count: n courses of a subject at a level", () => {
    const two200 = {
      type: "count",
      n: 2,
      subject: "ENGL",
      level: 200,
      text: "two 200-division English courses",
    } as PrereqNode;
    expect(truth(two200, context)).toBe("met");
    expect(truth({ ...two200, n: 3 } as PrereqNode, context)).toBe("unmet");
    expect(
      truth({ type: "count", n: 1, text: "one course" } as PrereqNode, context),
    ).toBe("unknown");
  });
});

describe("permission, restriction, unknown, alt_group, external", () => {
  const perm: PrereqNode = {
    type: "permission",
    who: "instructor",
    text: "permission of the instructor",
  };

  test("permission is never met; needsPermission when it is the only way", () => {
    const r = evaluateNode(any(c("MATH 340"), perm), ctx(), "prereq");
    expect(r).toMatchObject({ truth: "unmet", needsPermission: true });
    const r2 = evaluateNode(all(c("MATH 340"), perm), ctx(), "prereq");
    expect(r2).toMatchObject({ truth: "unmet", needsPermission: false });
    const r3 = evaluateNode(
      any(c("BUS 201"), perm),
      ctx({ completed: new Map([["BUS 201", "A"]]) }),
      "prereq",
    );
    expect(r3).toMatchObject({ truth: "met", needsPermission: false });
  });

  test("restriction: exact texts in the policy table resolve; others stay unknown", () => {
    const bba: PrereqNode = {
      type: "restriction",
      text: "This course is only open to approved business administration majors admitted to the faculty in Fall 2022 and onward",
    };
    expect(truth(bba)).toBe("met");
    expect(
      truth(
        bba,
        ctx({ student: { program: "BBA", admissionTerm: "2021-fall" } }),
      ),
    ).toBe("unmet");
    expect(
      truth(
        bba,
        ctx({ student: { program: "BA", admissionTerm: "2024-fall" } }),
      ),
    ).toBe("unmet");
    const pathway: PrereqNode = {
      type: "restriction",
      text: "This course is only open to approved business administration majors admitted to the faculty through the Business Foundation Pathways - High School Pathway",
    };
    expect(truth(pathway)).toBe("unknown");
    expect(
      truth({
        ...bba,
        text: bba.type === "restriction" ? bba.text + "." : "",
      } as PrereqNode),
    ).toBe("unknown"); // exact only
  });

  test("unknown nodes are unknown", () => {
    expect(evaluateNode(unknownNode, ctx(), "prereq")).toMatchObject({
      truth: "unknown",
      reasons: ["something unclear"],
    });
  });

  test("alt_group inside any is ignored, with a note; all-alt_group any is unknown", () => {
    const alt: PrereqNode = {
      type: "alt_group",
      group: "data science majors",
      text: "data science majors with 45 units",
    };
    const r = evaluateNode(
      any(c("BUS 201"), alt),
      ctx({ completed: new Map([["BUS 201", "A"]]) }),
      "prereq",
    );
    expect(r.truth).toBe("met");
    expect(r.notes.join(" ")).toMatch(
      /alternative route exists for data science majors/,
    );
    expect(truth(any(c("BUS 999"), alt))).toBe("unmet");
    expect(truth(any(alt, { ...alt, group: "other" } as PrereqNode))).toBe(
      "unknown",
    );
  });

  test("external needs the student's declared answer", () => {
    const pre: PrereqNode = {
      type: "external",
      kind: "high_school",
      minGrade: "B",
      text: "Pre-Calculus 12 (or equivalent) with a grade of at least B",
    };
    expect(truth(pre)).toBe("unknown");
    expect(
      truth(
        pre,
        ctx({
          declarations: {
            external: { [pre.type === "external" ? pre.text : ""]: true },
          },
        }),
      ),
    ).toBe("met");
    expect(
      truth(
        pre,
        ctx({
          declarations: {
            external: { [pre.type === "external" ? pre.text : ""]: false },
          },
        }),
      ),
    ).toBe("unmet");
  });
});
