import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import {
  planRemaining,
  type PlanItem,
  type RemainingTerm,
} from "@/engine/plan/remaining";
import type { PlanCatalog } from "@/engine/plan/types";
import { demoStudent } from "./fixtures/demo-student";
import { catalog, course, realCatalog, row, student, took } from "./helpers";

// planRemaining() tests, written with hand-worked expectations before the planner existed
// (rules decided by Stuart, 2026-10-04):
// - Plan every term from the start term until the remaining requirements are planned,
//   using the remaining courses, prerequisites, offering terms and the course load.
// - Co-op work terms are planned empty ("Co-op"); consecutive work terms are allowed
//   (Fall + Spring is an 8-month placement; Summer + Fall + Spring also chains).
// - Summer study terms only when the student said yes to summer.
//
// Synthetic catalog, every course 3 units and offered in spring, summer and fall 2025:
//   p1 one course AAA 101
//   p2 one course AAA 201        prerequisite AAA 101 (C-), not concurrent
//   p3 one course AAA 301        prerequisite AAA 201 (C-), not concurrent
//   p4 one course AAA 102 | AAA 103   (a choice: the first option, AAA 102, is planned)
//   p5 units from 21 (any course)
// The student completed AAA 100 (B, 3 units). Course load 2.
// Named courses: AAA 101, AAA 201, AAA 301, AAA 102 = 12 units; 3 + 12 = 15 of 21, so p5
// needs 6 more units = 2 open electives (3 units each).
// Placement, each term trying the named courses in sheet order, then electives:
//   term 1: AAA 101 yes; AAA 201 no (AAA 101 same term); AAA 301 no; AAA 102 yes -> full
//   term 2: AAA 201 yes (AAA 101 earlier); AAA 301 no (same term); elective
//   term 3: AAA 301 yes; elective -> everything planned

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

const codes = [
  "AAA 100",
  "AAA 101",
  "AAA 102",
  "AAA 103",
  "AAA 201",
  "AAA 301",
];
const everySeason = {
  "2025-spring": ["LEC"],
  "2025-summer": ["LEC"],
  "2025-fall": ["LEC"],
  future: {},
} as unknown as CourseOfferings;
const record = (code: string, needs: string | null): PrereqRecord => ({
  code,
  prereq: needs
    ? { type: "course", code: needs, minGrade: "C-", concurrentOk: false }
    : null,
  coreq: null,
  status: needs ? "parsed" : "none",
  source: "parsed",
  raw: "",
  raw_coreq: null,
  advisory: [],
  unparsed_fragments: [],
});
const synthetic: PlanCatalog = {
  ...catalog(
    [
      row({ req_id: "p1", courses: ["AAA 101"] }),
      row({ req_id: "p2", courses: ["AAA 201"] }),
      row({ req_id: "p3", courses: ["AAA 301"] }),
      row({ req_id: "p4", courses: ["AAA 102", "AAA 103"] }),
      row({ req_id: "p5", rule: "units from", n_or_units: 21 }),
    ],
    codes.map((c) => course(c, 3)),
  ),
  offerings: Object.fromEntries(codes.map((c) => [c, everySeason])),
  prereqs: [
    ...["AAA 100", "AAA 101", "AAA 102", "AAA 103"].map((c) => record(c, null)),
    record("AAA 201", "AAA 101"),
    record("AAA 301", "AAA 201"),
  ],
};
const s = student([took("AAA 100", "B")]);

const named = (code: string, reqIds: string[], choice = false): PlanItem => ({
  kind: "course",
  code,
  reqIds,
  choice,
});
const elective: PlanItem = {
  kind: "elective",
  slot: { level: null, business: null, designation: null, fromList: null },
  reqIds: ["p5"],
};
const study = (id: string, items: PlanItem[]): RemainingTerm => ({
  id,
  kind: "study",
  items,
});
const coop = (id: string): RemainingTerm => ({ id, kind: "coop", items: [] });

const term1 = [named("AAA 101", ["p1"]), named("AAA 102", ["p4"], true)];
const term2 = [named("AAA 201", ["p2"]), elective];
const term3 = [named("AAA 301", ["p3"]), elective];

describe("planRemaining: synthetic catalog (hand-worked)", () => {
  test.fails(
    "multi-term plan covers all remaining requirements in prerequisite order",
    () => {
      const p = planRemaining(s, synthetic, {
        startTerm: "2026-spring",
        courseLoad: 2,
        summer: "none",
        coopTerms: [],
      });
      expect(p.terms).toEqual([
        study("2026-spring", term1),
        study("2026-fall", term2),
        study("2027-spring", term3),
      ]);
      expect(p.unscheduled).toEqual([]);
      expect(p.notPlannable).toEqual([]);
      expect(
        p.validation.violations.filter((v) => v.code === "PREREQ_UNMET"),
      ).toEqual([]);
    },
  );

  test.fails("summer is skipped when summer isn't selected", () => {
    const without = planRemaining(s, synthetic, {
      startTerm: "2026-spring",
      courseLoad: 2,
      summer: "none",
      coopTerms: [],
    });
    expect(without.terms.map((t) => t.id)).toEqual([
      "2026-spring",
      "2026-fall",
      "2027-spring",
    ]);
    // With summer, the same courses move up a term.
    const withSummer = planRemaining(s, synthetic, {
      startTerm: "2026-spring",
      courseLoad: 2,
      summer: "full",
      coopTerms: [],
    });
    expect(withSummer.terms).toEqual([
      study("2026-spring", term1),
      study("2026-summer", term2),
      study("2026-fall", term3),
    ]);
  });

  test.fails("an 8-month Fall + Spring co-op leaves both terms empty", () => {
    const p = planRemaining(s, synthetic, {
      startTerm: "2026-spring",
      courseLoad: 2,
      summer: "none",
      coopTerms: ["2026-fall", "2027-spring"],
    });
    // 2027-summer is skipped (no summer study); the remaining courses follow the placement.
    expect(p.terms).toEqual([
      study("2026-spring", term1),
      coop("2026-fall"),
      coop("2027-spring"),
      study("2027-fall", term2),
      study("2028-spring", term3),
    ]);
  });

  test.fails("Summer + Fall + Spring work terms chain", () => {
    const p = planRemaining(s, synthetic, {
      startTerm: "2026-spring",
      courseLoad: 2,
      summer: "none",
      coopTerms: ["2026-summer", "2026-fall", "2027-spring"],
    });
    expect(p.terms).toEqual([
      study("2026-spring", term1),
      coop("2026-summer"),
      coop("2026-fall"),
      coop("2027-spring"),
      study("2027-fall", term2),
      study("2028-spring", term3),
    ]);
  });
});

describe("planRemaining: demo student from 2027-spring (real data)", () => {
  const real: PlanCatalog = {
    ...realCatalog(),
    offerings: json("data/generated/offerings.json") as Record<
      string,
      CourseOfferings
    >,
    prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
  };
  // Unmet single-course rows for the demo student (tests/engine/fixtures/
  // demo-student.expected.ts): BUS 373, BUS 478, BUS 496, BUS 313, BUS 315.
  // BUS 410 needs BUS 315 in an earlier term (tests/engine/plan.test.ts); BUS 478 needs
  // BUS 374 or BUS 381 (tests/engine/fixtures/suggest.expected.ts).
  test.fails(
    "every remaining required course is planned, prerequisites first",
    () => {
      const p = planRemaining(demoStudent, real, {
        startTerm: "2027-spring",
        courseLoad: 4,
        summer: "none",
        coopTerms: [],
      });
      const termOf = new Map<string, number>();
      p.terms.forEach((t, i) => {
        for (const item of t.items)
          if (item.kind === "course") termOf.set(item.code, i);
      });
      for (const code of [
        "BUS 373",
        "BUS 478",
        "BUS 496",
        "BUS 313",
        "BUS 315",
      ])
        expect(termOf.has(code), code).toBe(true);
      if (termOf.has("BUS 410"))
        expect(termOf.get("BUS 410")!).toBeGreaterThan(termOf.get("BUS 315")!);
      const orgOrHr = Math.min(
        termOf.get("BUS 374") ?? Infinity,
        termOf.get("BUS 381") ?? Infinity,
      );
      expect(termOf.get("BUS 478")!).toBeGreaterThan(orgOrHr);
      expect(p.terms[0]!.id).toBe("2027-spring");
      expect(p.terms.some((t) => t.id.endsWith("-summer"))).toBe(false);
      expect(p.terms.every((t) => t.items.length <= 4)).toBe(true);
      expect(p.unscheduled).toEqual([]);
      expect(
        p.validation.violations.filter(
          (v) => v.code === "PREREQ_UNMET" || v.code === "COREQ_UNMET",
        ),
      ).toEqual([]);
    },
  );
});
