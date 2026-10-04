import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { audit } from "@/engine/audit";
import { planRemaining } from "@/engine/plan/remaining";
import type { PlanCatalog } from "@/engine/plan/types";
import {
  coopTerms,
  summerChoice,
  toEngineStudent,
  toPlanOptions,
} from "@/lib/app/engine-input";
import { presentPlan } from "@/lib/app/present";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import type { StudentProfile } from "@/lib/app/types";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { realCatalog } from "../../engine/helpers";

// B6: My plan's header showed one term while the settings showed another. The header and
// the grid must both start from the selected start term (profile.planTerm), whatever it is
// (a summer start is planned even when summer terms are left out, and a co-op start is a
// work term). Same wiring as src/lib/app/degree.ts.

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const catalog: PlanCatalog = {
  ...realCatalog(),
  offerings: json("data/generated/offerings.json") as Record<
    string,
    CourseOfferings
  >,
  prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
};

function view(profile: StudentProfile) {
  const student = toEngineStudent(profile);
  return presentPlan(
    planRemaining(student, catalog, toPlanOptions(profile)),
    catalog.requirements,
    audit(student, catalog),
    profile,
    catalog.courses,
    {
      summer: summerChoice(profile).summer,
      summerUnsure: summerChoice(profile).unsure,
      unitLoad: catalog.policy.unit_load,
      electiveUnits: 3,
      coop: { doing: profile.coop.doing, ...coopTerms(profile) },
    },
  );
}

describe("the plan starts from the selected term", () => {
  test.each(["2027-spring", "2027-fall", "2028-summer"])("%s", (planTerm) => {
    const plan = view({ ...SAMPLE_PROFILE, planTerm });
    expect(plan.termId).toBe(planTerm);
    expect(plan.terms[0]!.termId).toBe(planTerm);
    expect(plan.terms[0]!.kind).toBe("study");
  });

  test("a start term picked as a work term is a co-op term", () => {
    const plan = view({
      ...SAMPLE_PROFILE,
      planTerm: "2027-fall",
      coop: { doing: true, workTerms: ["2027-fall", "2028-spring"] },
    });
    expect(plan.termId).toBe("2027-fall");
    expect(plan.terms.slice(0, 2).map((t) => [t.termId, t.kind])).toEqual([
      ["2027-fall", "coop"],
      ["2028-spring", "coop"],
    ]);
  });
});
