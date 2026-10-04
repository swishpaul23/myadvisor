import { describe, expect, test } from "vitest";
import { audit } from "@/engine/audit";
import { evaluateNode, type PrereqContext } from "@/engine/prereqs/evaluate";
import { policy, realCatalog, student, took } from "./helpers";

// Grade and elective rules decided by Stuart (2026-10-04), expectations worked out by hand
// from data/generated/*.json before the engine change:
// - P (pass) and CR (credit) count as completed: they satisfy requirements and every
//   prerequisite, including ones with a minimum grade, earn units, and are left out of GPA.
//   No ASSUMPTION note for P. F, N, W and DE don't count.
// - Repeats: the best passing attempt counts for requirements; units are counted once.
// - A course that isn't in MyAdvisor's course data (e.g. PSYC 100) is elective credit: it
//   earns units and is left out of the Business GPA. It is not an error.

const catalog = realCatalog();
const ctx = (completed: [string, string][]): PrereqContext => ({
  policy: policy(),
  completed: new Map(completed),
  earlier: new Set(),
  sameTerm: new Set(),
  passedBefore: [],
  student: { program: "BBA", admissionTerm: "2023-fall" },
  declarations: {},
});
const resultOf = (r: ReturnType<typeof audit>, id: string) =>
  r.results.find((x) => x.reqId === id)!;

describe("P and CR", () => {
  test("P satisfies a prerequisite with a minimum grade", () => {
    // BUS 272 is not a pass/fail course; the prerequisite asks for C-.
    const r = evaluateNode(
      { type: "course", code: "BUS 272", minGrade: "C-", concurrentOk: false },
      ctx([["BUS 272", "P"]]),
      "prereq",
    );
    expect(r.truth).toBe("met");
    expect(r.notes).toEqual([]);
  });

  test("BUS 237 and BUS 272 (Fall 2023, P) show complete", () => {
    // lower-bus237 and lower-bus272 are "one course" rows with a C- minimum. BUS 237 and
    // BUS 272 are 3 units each in courses.json, so 6 units are earned.
    const s = student(
      [
        took("BUS 237", "P", { term: "2023-fall" }),
        took("BUS 272", "P", { term: "2023-fall" }),
      ],
      { admissionTerm: "2023-fall", declaredConcentrations: ["Finance"] },
    );
    const r = audit(s, catalog);
    for (const [id, code] of [
      ["lower-bus237", "BUS 237"],
      ["lower-bus272", "BUS 272"],
    ] as const) {
      const row = resultOf(r, id);
      expect(row.status, id).toBe("met");
      expect(row.usedCourses, id).toEqual([code]);
      expect(row.missing, id).toEqual([]);
      expect(row.notes.join(" "), id).not.toMatch(/ASSUMPTION/);
    }
    // The C- rule over the core (beedie-core-grade) finds no violation.
    expect(resultOf(r, "beedie-core-grade")).toMatchObject({
      status: "met",
      usedCourses: [],
    });
    expect(r.summary.earnedUnits).toBe(6);
    // P carries no grade points: no graded BUS course, so the BUS GPA is unknown, not 0.
    expect(r.summary.gpas["beedie-bus-gpa-graduation"]).toBeNull();
  });

  test("repeats: the best passing attempt counts, units once", () => {
    // BUS 232: F (2023-fall), then B (2024-spring) -> lower-stats met with BUS 232.
    // BUS 251: W (2023-fall), then P (2024-spring) -> lower-bus251 met.
    // Units: BUS 232 3 + BUS 251 3 = 6 (each counted once).
    const s = student([
      took("BUS 232", "F", { term: "2023-fall" }),
      took("BUS 232", "B", { term: "2024-spring" }),
      took("BUS 251", "W", { term: "2023-fall" }),
      took("BUS 251", "P", { term: "2024-spring" }),
    ]);
    const r = audit(s, catalog);
    expect(resultOf(r, "lower-stats")).toMatchObject({
      status: "met",
      usedCourses: ["BUS 232"],
    });
    expect(resultOf(r, "lower-bus251")).toMatchObject({
      status: "met",
      usedCourses: ["BUS 251"],
    });
    expect(r.summary.earnedUnits).toBe(6);
  });

  test("F, N, W and DE don't count", () => {
    const s = student([
      took("BUS 237", "F"),
      took("BUS 272", "N"),
      took("BUS 251", "W"),
      took("BUS 254", "DE"),
    ]);
    const r = audit(s, catalog);
    for (const id of [
      "lower-bus237",
      "lower-bus272",
      "lower-bus251",
      "lower-bus254",
    ])
      expect(resultOf(r, id).status, id).toBe("unmet");
    expect(r.summary.earnedUnits).toBe(0);
  });
});

describe("courses outside MyAdvisor's course data", () => {
  test.fails(
    "unknown course (PSYC 100) is accepted as elective credit, excluded from Business GPA",
    () => {
      // PSYC 100 is not in courses.json. It counts as a 3-unit elective (no units given),
      // outside BUS, with no W/Q/B designation. BUS 237 (B, 3 units) is the only BUS course.
      //   univ-total: 3 + 3 = 6 units, unmet (not unknown)
      //   beedie-nonbus (outside BUS/BUEC): 3 units
      //   beedie-bus-gpa-graduation (SFU BUS): 3.00 from BUS 237 only
      //   gpa-cum (all SFU courses): (4.00*3 + 3.00*3) / 6 = 3.50
      const s = student([
        took("PSYC 100", "A", { term: "2023-fall" }),
        took("BUS 237", "B", { term: "2023-fall" }),
      ]);
      const r = audit(s, catalog);
      expect(resultOf(r, "univ-total")).toMatchObject({
        status: "unmet",
        progress: { have: 6, need: 120, unit: "units" },
      });
      expect(resultOf(r, "beedie-nonbus").progress.have).toBe(3);
      expect(r.summary.earnedUnits).toBe(6);
      expect(r.summary.gpas["beedie-bus-gpa-graduation"]).toBe(3);
      expect(r.summary.gpas["gpa-cum"]).toBe(3.5);
      // Not an unknown anywhere: the breadth rows are plainly unmet, not "can't check".
      expect(r.unknowns.filter((u) => u.reason.includes("PSYC 100"))).toEqual(
        [],
      );
      expect(resultOf(r, "univ-breadth-social").status).toBe("unmet");
    },
  );
});
