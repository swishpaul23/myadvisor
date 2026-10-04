import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { PlanCatalog } from "@/engine/plan/types";
import { boardFromPlan, moveItem, termUnits } from "@/lib/app/plan-board";
import { checkBoard, planFor, problemCount } from "@/lib/app/plan-check";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import type { StudentProfile } from "@/lib/app/types";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { realCatalog } from "../../engine/helpers";

// The semester-card board: moves, unit totals and the validator's flags. Expected results
// are written by hand from the sample student's generated plan:
//   2027-spring  BUS 373, BUS 374, BUS 346, BUS 313          (12 units)
//   2027-fall    BUS 315, @0 (B-Sci), @1 (B-Sci), @2         (12 units)
//   2028-spring  BUS 410, BUS 412, @3, @4                    (12 units)
//   2028-fall    BUS 478, BUS 496, BUS 411, @5
// and prereqs.json: BUS 410 needs BUS 315 and BUS 360W (C-) and 60 units.

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const catalog: PlanCatalog = {
  ...realCatalog(),
  offerings: json("data/generated/offerings.json") as Record<
    string,
    CourseOfferings
  >,
  prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
};
const boardFor = (profile: StudentProfile) =>
  boardFromPlan(planFor(profile, catalog).plan);
const ids = (terms: { termId: string; itemIds: string[] }[]) =>
  Object.fromEntries(terms.map((t) => [t.termId, t.itemIds]));

describe("boardFromPlan", () => {
  test("one card per term; named courses by code, electives as @n in plan order", () => {
    const board = boardFor(SAMPLE_PROFILE);
    expect(ids(board.terms)).toEqual({
      "2027-spring": ["BUS 373", "BUS 374", "BUS 346", "BUS 313"],
      "2027-fall": ["BUS 315", "@0", "@1", "@2"],
      "2028-spring": ["BUS 410", "BUS 412", "@3", "@4"],
      "2028-fall": ["BUS 478", "BUS 496", "BUS 411", "@5"],
    });
    expect(board.items["@0"]).toMatchObject({ code: null, units: 3 });
    expect(board.items["BUS 410"]).toMatchObject({
      code: "BUS 410",
      units: 3,
    });
  });
});

describe("moveItem", () => {
  test("moves a course to the end of another term and nothing else", () => {
    const { terms } = boardFor(SAMPLE_PROFILE);
    expect(ids(moveItem(terms, "BUS 410", "2027-spring"))).toEqual({
      "2027-spring": ["BUS 373", "BUS 374", "BUS 346", "BUS 313", "BUS 410"],
      "2027-fall": ["BUS 315", "@0", "@1", "@2"],
      "2028-spring": ["BUS 412", "@3", "@4"],
      "2028-fall": ["BUS 478", "BUS 496", "BUS 411", "@5"],
    });
  });

  test("moving to its own term or an unknown term changes nothing", () => {
    const { terms } = boardFor(SAMPLE_PROFILE);
    expect(moveItem(terms, "BUS 410", "2028-spring")).toEqual(terms);
    expect(moveItem(terms, "BUS 410", "2031-fall")).toEqual(terms);
  });
});

describe("unit totals per card", () => {
  test("update after a move: 12 + 3 = 15 and 12 - 3 = 9", () => {
    const { terms, items } = boardFor(SAMPLE_PROFILE);
    const units = (t: typeof terms) =>
      Object.fromEntries(t.map((x) => [x.termId, termUnits(x, items)]));
    expect(units(terms)).toMatchObject({
      "2027-spring": 12,
      "2027-fall": 12,
      "2028-spring": 12,
    });
    expect(units(moveItem(terms, "BUS 410", "2027-spring"))).toMatchObject({
      "2027-spring": 15,
      "2027-fall": 12,
      "2028-spring": 9,
    });
  });
});

describe("validation on every move", () => {
  test("the generated plan has no red flags", () => {
    const board = boardFor(SAMPLE_PROFILE);
    const check = checkBoard(SAMPLE_PROFILE, board.terms, board.items, catalog);
    expect(check.flags).toEqual({});
    for (const t of board.terms) expect(problemCount(t, check)).toBe(0);
  });

  test("moving a course before its prerequisite flags it with the reason; moving it back clears it", () => {
    const board = boardFor(SAMPLE_PROFILE);
    const early = moveItem(board.terms, "BUS 410", "2027-spring");
    const before = checkBoard(SAMPLE_PROFILE, early, board.items, catalog);
    expect(before.flags["BUS 410"]).toEqual([
      "Prerequisite not met by this term: BUS 315 (minimum C-) is not completed or planned earlier.",
    ]);
    expect(problemCount(early[0]!, before)).toBe(1);
    expect(before.rules["BUS 410"]?.prereq).toEqual({
      text: "BUS 315 and BUS 360W, both with a minimum grade of C-; 60 units.",
      status: "not_met",
    });

    const back = moveItem(early, "BUS 410", "2028-spring");
    const after = checkBoard(SAMPLE_PROFILE, back, board.items, catalog);
    expect(after.flags["BUS 410"]).toBeUndefined();
    expect(after.rules["BUS 410"]?.prereq?.status).toBe("met");
    expect(problemCount(back[0]!, after)).toBe(0);
  });

  test("dropping a course or an elective into a co-op term is flagged, not rejected", () => {
    const coop: StudentProfile = {
      ...SAMPLE_PROFILE,
      coop: { doing: true, workTerms: ["2027-fall"] },
    };
    const board = boardFor(coop);
    const coopTerm = board.terms.find((t) => t.termId === "2027-fall")!;
    expect(coopTerm).toMatchObject({ kind: "coop", itemIds: [] });

    const moved = moveItem(
      moveItem(board.terms, "BUS 373", "2027-fall"),
      "@0",
      "2027-fall",
    );
    expect(moved.find((t) => t.termId === "2027-fall")!.itemIds).toEqual([
      "BUS 373",
      "@0",
    ]);
    const check = checkBoard(coop, moved, board.items, catalog);
    const reason =
      "This is a co-op work term. Move this course to a study term.";
    expect(check.flags["BUS 373"]).toEqual([reason]);
    expect(check.flags["@0"]).toEqual([reason]);
    expect(
      problemCount(
        moved.find((t) => t.termId === "2027-fall")!,
        check,
      ),
    ).toBe(2);
  });

  test("more than 18 units in a term is a problem on the card", () => {
    const board = boardFor(SAMPLE_PROFILE);
    let terms = board.terms;
    for (const id of ["BUS 315", "@0", "@1"])
      terms = moveItem(terms, id, "2027-spring");
    // 4 courses + 3 = 7 courses, 21 units.
    expect(termUnits(terms[0]!, board.items)).toBe(21);
    const check = checkBoard(SAMPLE_PROFILE, terms, board.items, catalog);
    expect(check.termProblems["2027-spring"]).toEqual([
      "21 units is above the 18-unit maximum.",
    ]);
    expect(problemCount(terms[0]!, check)).toBeGreaterThanOrEqual(1);
  });
});
