import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { audit } from "@/engine/audit";
import type { ReqResult } from "@/engine/audit/types";
import type { RemainingPlan } from "@/engine/plan/remaining";
import type { PlanCatalog } from "@/engine/plan/types";
import { toEngineStudent } from "@/lib/app/engine-input";
import {
  buildChecklist,
  buildGaps,
  electiveLabel,
  presentPlan,
  recordSummary,
  requiredCourseClaim,
  rowItemStatus,
  skippedClaim,
  sourceTitle,
  unitsSummary,
} from "@/lib/app/present";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { realCatalog, row } from "../../engine/helpers";

// Presentation of the engine's results for the sample (= demo) student. Expected values
// follow the hand-checked demo audit (tests/engine/fixtures/demo-student.expected.ts) and
// suggestion (suggest.expected.ts) through the presenter's display rules.

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const catalog: PlanCatalog = {
  ...realCatalog(),
  offerings: json("data/generated/offerings.json") as Record<
    string,
    CourseOfferings
  >,
  prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
};
const student = toEngineStudent(SAMPLE_PROFILE);
const result = audit(student, catalog);
const BBA =
  "https://www.sfu.ca/students/calendar/2026/fall/programs/business/major/bachelor-of-business-administration.html";

describe("checklist (Complete / In progress / Gap / Unresolved)", () => {
  test("row status: unmet single course = gap; other unmet rows are in progress", () => {
    const single = row({ req_id: "a", courses: ["BUS 313"] });
    const choice = row({ req_id: "b", courses: ["BUS 374", "BUS 381"] });
    const units = row({ req_id: "c", rule: "units from", n_or_units: 45 });
    expect(rowItemStatus(single, "unmet")).toBe("gap");
    expect(rowItemStatus(choice, "unmet")).toBe("in_progress");
    expect(rowItemStatus(units, "unmet")).toBe("in_progress");
    expect(rowItemStatus(single, "met")).toBe("complete");
    expect(rowItemStatus(single, "in_progress")).toBe("in_progress");
    expect(rowItemStatus(single, "unknown")).toBe("unresolved");
    expect(rowItemStatus(single, "not_applicable")).toBeNull();
  });

  test("the sample student's checklist", () => {
    expect(
      buildChecklist(catalog.requirements, result).map((i) => [
        i.label,
        i.status,
        i.detail,
      ]),
    ).toEqual([
      ["BBA lower-division core", "complete", null],
      ["BBA upper-division core", "gap", "BUS 373, BUS 478 +1 missing"],
      ["Finance concentration", "gap", "BUS 313, BUS 315 missing"],
      ["Writing, Quantitative, Breadth", "in_progress", "14 of 17 done"],
      ["Upper-division units", "in_progress", "4 of 45 units"],
      ["Units outside Business", "in_progress", "26 of 36 units"],
      ["Total units", "in_progress", "61 of 120 units"],
      ["GPA and grades", "complete", null],
    ]);
  });
});

describe("gaps", () => {
  test("required courses not on the record, concentration first, each with its source", () => {
    const gaps = buildGaps(catalog.requirements, result);
    expect(gaps.map((g) => g.label)).toEqual([
      "BUS 313",
      "BUS 315",
      "BUS 373",
      "BUS 478",
      "BUS 496",
    ]);
    expect(gaps[0]).toEqual({
      reqId: "finance-bus313",
      label: "BUS 313",
      courses: ["BUS 313"],
      detail: "Required for the Finance concentration. Not on your record yet.",
      source: { title: "SFU Calendar · BBA program requirements", url: BBA },
    });
  });
});

describe("units and record", () => {
  test("units: 61 completed, 13 in progress, 120 required", () => {
    expect(unitsSummary(result)).toEqual({
      completed: 61,
      inProgress: 13,
      required: 120,
    });
  });
  test("record keeps completed, in-progress and transfer apart", () => {
    expect(recordSummary(SAMPLE_PROFILE, result, catalog.courses)).toEqual({
      completed: { courses: 21, units: 61 }, // 22 completed attempts, MATH 157 twice
      inProgress: { courses: 4, units: 13 },
      transfer: { courses: 1, units: 4 }, // ECON 105
      confirmed: true,
    });
  });
});

describe("source titles", () => {
  test("known calendar pages", () => {
    expect(sourceTitle(BBA)).toBe("SFU Calendar · BBA program requirements");
    expect(
      sourceTitle(
        "https://www.sfu.ca/students/calendar/2026/fall/fees-and-regulations/enrolment/WQB.html",
      ),
    ).toBe("SFU Calendar · WQB requirements");
    expect(
      sourceTitle(
        "https://www.sfu.ca/students/calendar/2026/fall/courses/bus/360w.html",
      ),
    ).toBe("SFU Calendar · BUS 360W");
  });
});

describe("claim statuses", () => {
  const bus313 = catalog.requirements.find(
    (r) => r.req_id === "finance-bus313",
  )!;
  const bus313Result = result.results.find((r) => r.reqId === "finance-bus313");

  test("required course never attempted: VERIFIED (the grade assumption can't matter)", () => {
    expect(
      requiredCourseClaim("BUS 313", bus313, bus313Result, SAMPLE_PROFILE),
    ).toEqual({
      text: "BUS 313 is required for the Finance concentration and isn't on your record.",
      status: "verified",
      source: { title: "SFU Calendar · BBA program requirements", url: BBA },
    });
  });

  test("required course attempted, row has an engine ASSUMPTION note: ASSUMPTION", () => {
    const failed = {
      ...SAMPLE_PROFILE,
      courses: [
        ...SAMPLE_PROFILE.courses,
        {
          code: "BUS 313",
          term: "2026-summer",
          status: "completed" as const,
          grade: "D" as const,
          institution: "SFU" as const,
          units: null,
        },
      ],
    };
    const withNote = {
      ...bus313Result!,
      notes: ["ASSUMPTION: any passing grade counts here."],
    } as ReqResult;
    expect(
      requiredCourseClaim("BUS 313", bus313, withNote, failed).status,
    ).toBe("assumption");
    expect(
      requiredCourseClaim("BUS 313", bus313, { ...withNote, notes: [] }, failed)
        .status,
    ).toBe("verified");
  });

  test("skipped: a firm 'no' is VERIFIED; 'can't check' is UNRESOLVED", () => {
    expect(
      skippedClaim(
        {
          code: "BUS 478",
          reqIds: ["upper-bus478"],
          reasons: ["PREREQ_UNMET"],
        },
        undefined,
      ),
    ).toMatchObject({
      status: "verified",
      text: "BUS 478 couldn't be placed in any term: its prerequisites aren't met yet.",
    });
    for (const reason of [
      "PREREQ_UNKNOWN",
      "PREREQ_NEEDS_PERMISSION",
      "NO_COURSE_DATA",
    ] as const) {
      expect(
        skippedClaim(
          { code: "BUS 360W", reqIds: [], reasons: [reason] },
          undefined,
        ).status,
      ).toBe("unresolved");
    }
  });
});

describe("presentPlan: a hand-built multi-term plan for the sample student", () => {
  // Built by hand (not by the planner) so the expectations follow only the display rules.
  const remaining: RemainingPlan = {
    terms: [
      {
        id: "2027-spring",
        kind: "study",
        items: [
          {
            kind: "course",
            code: "BUS 373",
            reqIds: ["upper-bus373"],
            choice: false,
          },
          {
            kind: "course",
            code: "BUS 374",
            reqIds: ["upper-organization-or-hr"],
            choice: true,
          },
          {
            kind: "elective",
            slot: {
              level: "400",
              business: true,
              designation: null,
              fromList: null,
            },
            reqIds: ["upper-400-courses", "upper-business-units"],
          },
        ],
      },
      { id: "2027-fall", kind: "coop", items: [] },
      {
        id: "2028-spring",
        kind: "study",
        items: [
          {
            kind: "elective",
            slot: {
              level: null,
              business: false,
              designation: "B-Sci",
              fromList: null,
            },
            reqIds: ["univ-breadth-science"],
          },
        ],
      },
    ],
    unscheduled: [],
    notPlannable: [],
    plan: { terms: [] },
    validation: {
      violations: [],
      terms: [],
      graduationTerm: null,
      graduationTermExcludingUnknown: null,
      graduationAssumesValidPlan: false,
      graduationBlockers: [],
      auditAfterPlan: result,
    },
  };
  const context = {
    summer: "none" as const,
    summerUnsure: true,
    unitLoad: catalog.policy.unit_load,
    electiveUnits: 3,
  };
  const plan = presentPlan(
    remaining,
    catalog.requirements,
    result,
    SAMPLE_PROFILE,
    catalog.courses,
    context,
  );

  test("every term from the start term; co-op terms are empty", () => {
    expect(plan.terms).toEqual([
      {
        termId: "2027-spring",
        kind: "study",
        units: 9,
        courses: [
          {
            code: "BUS 373",
            label: "BUS 373",
            note: "Closes gap · BBA upper-division core",
            units: 3,
            closesGap: true,
          },
          {
            code: "BUS 374",
            label: "BUS 374",
            note: "One option for Organization or HR course · you can swap it",
            units: 3,
            closesGap: false,
          },
          {
            code: null,
            label: "400-level BUS elective",
            note: "Your choice · counts toward 400-level BUS courses, Upper-division BUS units",
            units: 3,
            closesGap: false,
          },
        ],
      },
      { termId: "2027-fall", kind: "coop", units: 0, courses: [] },
      {
        termId: "2028-spring",
        kind: "study",
        units: 3,
        courses: [
          {
            code: null,
            label: "Science breadth (B-Sci) course, outside Business",
            note: "Your choice · counts toward Science breadth (B-Sci)",
            units: 3,
            closesGap: false,
          },
        ],
      },
    ]);
  });

  test("the first term is the next-term draft; finish term when all is planned", () => {
    expect(plan.termId).toBe("2027-spring");
    expect(plan.courses).toEqual(plan.terms[0]!.courses);
    expect(plan.units).toBe(9);
    expect(plan.finishTerm).toBe("2028-spring");
  });

  test("summer left out because the student wasn't sure: a neutral note", () => {
    expect(plan.notes).toEqual([
      "Summer terms are left out because you weren't sure about summer courses. Choose a summer option in Plan settings to include them.",
    ]);
  });

  test("every claim labelled: verified, then assumptions, then unresolved", () => {
    expect(plan.claims.map((c) => [c.status, c.text])).toEqual([
      [
        "verified",
        "BUS 373 is required for the BBA upper-division core and isn't on your record.",
      ],
      [
        "verified",
        "Each course comes after the courses it needs: prerequisites are checked term by term.",
      ],
      [
        "assumption",
        "BUS 374 is picked from a list of options; you can swap it for another option.",
      ],
      [
        "assumption",
        "2 electives are placeholders for requirements that count units, levels or designations, 3 units each.",
      ],
      [
        "assumption",
        "Your in-progress courses (BUS 312, BUS 343 +2) are assumed passed before Spring 2027.",
      ],
      [
        "assumption",
        "Offerings are estimated from past terms of the same season; no future timetable is confirmed.",
      ],
      ["assumption", "4 courses per term is the load you chose."],
      [
        "assumption",
        "Spring 2028 is below the 9-unit minimum (unit limits not yet confirmed against the calendar).",
      ],
      ["unresolved", "Seats and timetable fit aren't checked yet."],
    ]);
  });

  test("every verified claim cites a calendar page", () => {
    for (const c of plan.claims.filter((c) => c.status === "verified"))
      expect(c.source?.url, c.text).toMatch(
        /^https:\/\/www\.sfu\.ca\/students\/calendar\//,
      );
  });

  test("unscheduled courses and rows courses can't settle are said plainly", () => {
    const p = presentPlan(
      {
        ...remaining,
        unscheduled: [
          {
            code: "BUS 478",
            reqIds: ["upper-bus478"],
            reasons: ["PREREQ_UNMET"],
          },
        ],
        notPlannable: [{ reqId: "gpa-cum", status: "unknown" }],
      },
      catalog.requirements,
      result,
      SAMPLE_PROFILE,
      catalog.courses,
      { ...context, summer: "some", summerUnsure: false },
    );
    const texts = p.claims.map((c) => c.text);
    expect(texts).toContain(
      "BUS 478 couldn't be placed in any term: its prerequisites aren't met yet.",
    );
    expect(texts).toContain(
      "Adding courses can't settle this: Gpa cum. Check with an advisor.",
    );
    expect(texts).toContain(
      "4 courses per term is the load you chose (up to 2 in summer).",
    );
    expect(p.notes).toEqual([]);
    expect(p.finishTerm).toBeNull();
  });
});

describe("electiveLabel", () => {
  const rowById = new Map(catalog.requirements.map((r) => [r.req_id, r]));
  test.each([
    [{ level: "400", business: true }, "400-level BUS elective"],
    [{ level: "upper", business: true }, "Upper-division BUS elective"],
    [{ level: "upper", business: null }, "Upper-division elective"],
    [{ business: false }, "Elective outside Business"],
    [{}, "Open elective"],
    [
      { level: "upper", business: true, designation: "W" },
      "Writing (W) course, upper-division BUS",
    ],
    [{ designation: "Q" }, "Quantitative (Q) course"],
    [
      { business: false, fromList: "beedie-nonbus-group-a" },
      "Group A course outside Business",
    ],
  ] as const)("%o -> %s", (partial, label) => {
    expect(
      electiveLabel(
        {
          level: null,
          business: null,
          designation: null,
          fromList: null,
          ...partial,
        },
        rowById,
      ),
    ).toBe(label);
  });
});
