import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { validatePlan } from "@/engine/plan/validate";
import type { Plan, PlanCatalog } from "@/engine/plan/types";
import { demoStudent } from "./fixtures/demo-student";
import { realCatalog } from "./helpers";

// Placeholder electives (ValidateOptions.placeholders): written before the option. They count
// toward a term's units and make a co-op term non-empty; nothing else is checked for them.

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
const run = (p: Plan, placeholders?: Record<string, number[]>) =>
  validatePlan(
    demoStudent,
    p,
    catalog,
    {},
    { graduation: false, placeholders },
  );

describe("placeholder electives", () => {
  test("count toward the term's units: 3 named units + two 3-unit electives = 9", () => {
    const result = run(plan(["2027-fall", ["BUS 315"]]), {
      "2027-fall": [3, 3],
    });
    expect(result.terms).toEqual([
      expect.objectContaining({ id: "2027-fall", units: 9 }),
    ]);
    expect(result.violations.map((v) => v.code)).not.toContain("UNIT_LOAD_LOW");
  });

  test("without them the same term is 3 units, below the 9-unit minimum", () => {
    const result = run(plan(["2027-fall", ["BUS 315"]]));
    expect(result.terms[0]!.units).toBe(3);
    expect(result.violations.map((v) => v.code)).toContain("UNIT_LOAD_LOW");
  });

  test("push a term over the 18-unit maximum: 6 named + 5 electives = 21", () => {
    const result = run(plan(["2027-spring", ["BUS 373", "BUS 346"]]), {
      "2027-spring": [3, 3, 3, 3, 3],
    });
    expect(result.terms[0]!.units).toBe(21);
    expect(
      result.violations.filter((v) => v.code === "UNIT_LOAD_HIGH"),
    ).toEqual([
      expect.objectContaining({
        severity: "warning",
        termId: "2027-spring",
        courseCode: null,
        message:
          "21 units is above the 18-unit maximum (ASSUMPTION, verify against the calendar).",
      }),
    ]);
  });

  test("an elective alone in a co-op term is COURSES_IN_COOP_TERM", () => {
    const result = run(plan(["2027-summer", [], "coop"]), {
      "2027-summer": [3],
    });
    expect(result.violations).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "COURSES_IN_COOP_TERM",
        termId: "2027-summer",
        courseCode: null,
        message: "Co-op term lists courses: 1 elective.",
      }),
    ]);
  });

  test("named courses and electives in a co-op term are listed together", () => {
    const result = run(plan(["2027-summer", ["BUS 374"], "coop"]), {
      "2027-summer": [3, 3],
    });
    expect(result.violations.map((v) => v.message)).toEqual([
      "Co-op term lists courses: BUS 374, 2 electives.",
    ]);
  });

  test("an empty co-op term with no placeholders has no violation", () => {
    expect(run(plan(["2027-summer", [], "coop"]), {}).violations).toEqual([]);
  });
});
