import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { validatePlan } from "@/engine/plan/validate";
import type { Plan, PlanCatalog, ViolationCode } from "@/engine/plan/types";
import type { Student } from "@/engine/audit/types";
import { demoStudent } from "./fixtures/demo-student";
import { demoPlan } from "./fixtures/demo-plan";
import {
  expectedGraduation,
  expectedTerms,
  expectedViolations,
} from "./fixtures/demo-plan.expected";
import { realCatalog, student, took } from "./helpers";

// Validator tests (written before src/engine/plan/validate.ts). docs/validator-spec.md.

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const catalog: PlanCatalog = {
  ...realCatalog(),
  offerings: json("data/generated/offerings.json") as Record<
    string,
    CourseOfferings
  >,
  prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
};
const plan = (...terms: [string, string[], ("study" | "coop")?][]): Plan => ({
  terms: terms.map(([id, courses, kind]) => ({
    id,
    courses,
    kind: kind ?? "study",
  })),
});
const codes = (s: Student, p: Plan) =>
  validatePlan(s, p, catalog).violations.map(
    (v) => `${v.severity} ${v.code} ${v.courseCode ?? "-"} ${v.termId}`,
  );
const only = (s: Student, p: Plan, code: ViolationCode) =>
  validatePlan(s, p, catalog).violations.filter((v) => v.code === code);

describe("a valid plan", () => {
  test("no violations", () => {
    expect(
      codes(
        demoStudent,
        plan(["2027-spring", ["BUS 373", "BUS 346", "BPK 140"]]),
      ),
    ).toEqual([]);
  });
});

describe("prerequisites and corequisites", () => {
  test("PREREQ_UNMET: BUS 410 in the same term as BUS 315", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["BUS 315", "BUS 410", "BUS 373"]]),
        "PREREQ_UNMET",
      ),
    ).toMatchObject([
      { severity: "error", courseCode: "BUS 410", termId: "2027-spring" },
    ]);
  });
  test("prerequisite met when taken in an earlier term", () => {
    const p = plan(
      ["2027-spring", ["BUS 315", "BUS 373", "BUS 346"]],
      ["2027-summer", ["BUS 410", "BUS 417", "BUS 418"]],
    );
    expect(only(demoStudent, p, "PREREQ_UNMET")).toEqual([]);
  });
  test("PREREQ_NEEDS_PERMISSION: MATH 338", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-summer", ["MATH 338", "GEOG 104", "TEKX 101"]]),
        "PREREQ_NEEDS_PERMISSION",
      ),
    ).toMatchObject([{ severity: "warning", courseCode: "MATH 338" }]);
  });
  test("PREREQ_UNKNOWN: an unparsed prerequisite (PHIL 342)", () => {
    const v = only(
      demoStudent,
      plan(["2027-spring", ["PHIL 342", "BUS 373", "BUS 346"]]),
      "PREREQ_UNKNOWN",
    );
    expect(v).toMatchObject([{ severity: "unknown", courseCode: "PHIL 342" }]);
    expect(v[0]!.message).toMatch(/One prior philosophy course/);
  });
  test("COREQ_UNMET, and met when the corequisite is in the same term (BUS 330 with BUS 320)", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["BUS 330", "BUS 373", "BUS 346"]]),
        "COREQ_UNMET",
      ),
    ).toMatchObject([{ severity: "error", courseCode: "BUS 330" }]);
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["BUS 330", "BUS 320", "BUS 346"]]),
        "COREQ_UNMET",
      ),
    ).toEqual([]);
  });
  test("COREQ_UNKNOWN (INDG 442: 'Permission of an instructor and department')", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["INDG 442", "BUS 373", "BUS 346"]]),
        "COREQ_UNKNOWN",
      ),
    ).toMatchObject([{ severity: "unknown", courseCode: "INDG 442" }]);
  });
});

describe("offerings (season, previous two years)", () => {
  test("NOT_OFFERED_RECENTLY: BUS 419 runs in fall only", () => {
    expect(
      only(
        demoStudent,
        plan(["2028-spring", ["BUS 315", "BUS 373", "BUS 346"]]),
        "NOT_OFFERED_RECENTLY",
      ),
    ).toEqual([]);
    const v = only(
      demoStudent,
      plan(
        ["2027-spring", ["BUS 315", "BUS 373", "BUS 346"]],
        ["2028-spring", ["BUS 419", "BUS 418", "BUS 417"]],
      ),
      "NOT_OFFERED_RECENTLY",
    );
    expect(v).toMatchObject([
      { severity: "warning", courseCode: "BUS 419", termId: "2028-spring" },
    ]);
    expect(v[0]!.message).toMatch(
      /not offered in recent history, check the schedule/,
    );
  });
  test("NOT_OFFERED_FUTURE_ONLY: ECON 345 ran 2025-fall and is listed for 2027-spring", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["ECON 345", "BUS 373", "BUS 346"]]),
        "NOT_OFFERED_FUTURE_ONLY",
      ),
    ).toMatchObject([{ severity: "warning", courseCode: "ECON 345" }]);
  });
});

describe("plan structure and load", () => {
  test("NO_COURSE_DATA for a course outside the data", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["ZZZ 123", "BUS 373", "BUS 346"]]),
        "NO_COURSE_DATA",
      ),
    ).toMatchObject([{ severity: "unknown", courseCode: "ZZZ 123" }]);
  });
  test("DUPLICATE_IN_PLAN", () => {
    const p = plan(
      ["2027-spring", ["BUS 346", "BUS 373", "BPK 140"]],
      ["2027-summer", ["BUS 346", "GEOG 104", "TEKX 101"]],
    );
    expect(only(demoStudent, p, "DUPLICATE_IN_PLAN")).toMatchObject([
      { severity: "warning", courseCode: "BUS 346", termId: "2027-summer" },
    ]);
  });
  test("ALREADY_TAKEN unless a repeat is allowed", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["BUS 201", "BUS 373", "BUS 346"]]),
        "ALREADY_TAKEN",
      ),
    ).toMatchObject([{ severity: "warning", courseCode: "BUS 201" }]);
    const weak = student([
      took("BUS 251", "D", { term: "2025-fall" }),
      took("BUS 201", "B", { term: "2025-fall" }),
    ]);
    expect(
      only(weak, plan(["2026-spring", ["BUS 251"]]), "ALREADY_TAKEN"),
    ).toEqual([]); // D: repeat allowed
  });
  test("UNIT_LOAD_HIGH and UNIT_LOAD_LOW are warnings", () => {
    const heavy = [
      "BUS 373",
      "BUS 346",
      "BUS 313",
      "BUS 315",
      "BUS 374",
      "BPK 140",
      "GEOG 104",
    ];
    expect(
      only(demoStudent, plan(["2027-spring", heavy]), "UNIT_LOAD_HIGH"),
    ).toMatchObject([{ severity: "warning", courseCode: null }]);
    expect(
      only(demoStudent, plan(["2027-spring", ["BUS 373"]]), "UNIT_LOAD_LOW"),
    ).toMatchObject([{ severity: "warning" }]);
  });
  test("COURSES_IN_COOP_TERM", () => {
    expect(
      only(
        demoStudent,
        plan(["2027-spring", ["BUS 373"], "coop"]),
        "COURSES_IN_COOP_TERM",
      ),
    ).toMatchObject([{ severity: "error", termId: "2027-spring" }]);
  });
  test("PLAN_TERM_ORDER: before the student's last term, or out of order", () => {
    expect(
      only(
        demoStudent,
        plan(["2026-summer", ["BUS 373", "BUS 346", "BPK 140"]]),
        "PLAN_TERM_ORDER",
      ),
    ).toHaveLength(1);
    expect(
      only(
        demoStudent,
        plan(["2027-fall", ["BUS 373"]], ["2027-spring", ["BUS 346"]]),
        "PLAN_TERM_ORDER",
      ),
    ).toHaveLength(1);
  });
});

describe("entry GPA (BUS 300-499 needs the 2.30 SFU BUS GPA)", () => {
  test("error when the GPA is known and below 2.30", () => {
    const low = student(
      ["BUS 201", "BUS 237", "BUS 251", "BUS 272"].map((c) =>
        took(c, "D", { term: "2025-fall" }),
      ),
    );
    expect(
      only(low, plan(["2026-spring", ["BUS 346"]]), "ENTRY_GPA"),
    ).toMatchObject([{ severity: "error", courseCode: "BUS 346" }]);
    expect(only(low, plan(["2026-spring", ["BUS 272"]]), "ENTRY_GPA")).toEqual(
      [],
    ); // 200-level: no check
  });
  test("unknown when the GPA can't be computed", () => {
    const none = student([took("BUS 203", "P", { term: "2025-fall" })]);
    expect(
      only(none, plan(["2026-spring", ["BUS 300"]]), "ENTRY_GPA"),
    ).toMatchObject([{ severity: "unknown", courseCode: "BUS 300" }]);
  });
});

describe("golden plan for the demo student (hand-computed expectation)", () => {
  const result = validatePlan(demoStudent, demoPlan, catalog);

  test("violations", () => {
    expect(
      result.violations.map((v) => ({
        severity: v.severity,
        code: v.code,
        courseCode: v.courseCode,
        termId: v.termId,
      })),
    ).toEqual(expectedViolations);
  });
  test("running unit totals", () => {
    expect(result.terms).toEqual(expectedTerms);
  });
  test("graduation", () => {
    expect(result.graduationTerm).toBe(expectedGraduation.graduationTerm);
    expect(result.graduationTermExcludingUnknown).toBe(
      expectedGraduation.graduationTermExcludingUnknown,
    );
    expect(result.graduationAssumesValidPlan).toBe(
      expectedGraduation.graduationAssumesValidPlan,
    );
    expect(result.graduationBlockers).toEqual(
      expectedGraduation.graduationBlockers,
    );
    expect(result.auditAfterPlan.summary.byStatus).toEqual(
      expectedGraduation.auditByStatus,
    );
  });
});
