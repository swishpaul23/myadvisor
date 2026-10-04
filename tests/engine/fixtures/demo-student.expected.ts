import type { ReqStatus } from "@/engine/audit/types";

// Expected audit of tests/engine/fixtures/demo-student.ts, worked out BY HAND from
// data/generated/requirements.json, data/generated/courses.json and docs/engine-spec.md
// before the engine was written (2026-10-04). Do not edit these values to match engine
// output: if the engine disagrees, decide which side is wrong and say so.
//
// `have` is computed from completed courses only (spec section 2). `used` lists the
// completed courses the row uses, where the row uses specific courses.

export type ExpectedRow = {
  status: ReqStatus;
  have?: number | null;
  need?: number;
  used?: string[];
};

// Graded completed attempts for GPA (P, W, CR excluded; MATH 157's D attempt replaced by B):
//   BUS (11 courses x 3u): 201 B 3.00, 217W A- 3.67, 237 B 3.00, 232 C+ 2.33, 207 B+ 3.33,
//   251 B 3.00, 272 B- 2.67, 254 B 3.00, 240 B+ 3.33, 275 A 4.00, 303 B 3.00
//   -> points per unit sum 34.33, x3 = 102.99 over 33 units -> BUS GPA 3.1209 -> 3.12
//   Others: ECON 103 B+ 3.33x4 = 13.32, MATH 157 B 3.00x3 = 9.00, ENGL 112W A- 3.67x3 = 11.01,
//   GEOG 100 B 9.00, INDG 101 A- 11.01, HIST 135 B 9.00, CMNS 110 C 2.00x3 = 6.00
//   -> cumulative 171.33 / 55 = 3.1151 -> 3.12
//   Upper division graded: BUS 303 B only (BUS 300 is P) -> 3.00
//
// Earned units (each course once): 14 + 10 + 3 + 12 + 12 + 10 = 61. In progress: 13.
//
// Breadth (outside major = not BUS; C- or better; CR assumed to qualify), buckets matched in
// order social, humanities, science, additional; courses in code order:
//   B-Soc eligible: CMNS 110, ECON 105, GEOG 100, HIST 135, INDG 101 -> CMNS 110 (3) + ECON 105 (4) = 7u
//   B-Hum eligible: ENGL 112W, GEOG 100, HIST 135, INDG 101          -> ENGL 112W (3) + GEOG 100 (3) = 6u
//   B-Sci eligible: none                                             -> 0
//   Additional (any outside major): left ECON 103, HIST 135, INDG 101, MATH 157 -> ECON 103 (4) + HIST 135 (3) = 7u
//   Breadth total = all outside-major C- or better: 4+3+3+4+3+3+3+3 = 26u

export const expectedSummary = {
  earnedUnits: 61,
  inProgressUnits: 13,
  byStatus: {
    met: 40,
    in_progress: 5,
    unmet: 18,
    unknown: 2,
    not_applicable: 31,
  },
};

export const expectedRows: Record<string, ExpectedRow> = {
  // ---------- Lower core: all met (15) ----------
  "lower-foundation": { status: "met", have: 1, need: 1, used: ["BUS 201"] },
  "lower-bus203": { status: "met", have: 1, need: 1, used: ["BUS 203"] }, // P on a pass/fail course; admitted 2024-fall >= 2022-fall
  "lower-bus217w": { status: "met", have: 1, need: 1, used: ["BUS 217W"] },
  "lower-bus237": { status: "met", have: 1, need: 1, used: ["BUS 237"] },
  "lower-bus240": { status: "met", have: 1, need: 1, used: ["BUS 240"] },
  "lower-bus251": { status: "met", have: 1, need: 1, used: ["BUS 251"] },
  "lower-bus254": { status: "met", have: 1, need: 1, used: ["BUS 254"] },
  "lower-bus272": { status: "met", have: 1, need: 1, used: ["BUS 272"] },
  "lower-bus275": { status: "met", have: 1, need: 1, used: ["BUS 275"] },
  "lower-stats": { status: "met", have: 1, need: 1, used: ["BUS 232"] }, // C+ >= C-
  "lower-managerial-economics": {
    status: "met",
    have: 1,
    need: 1,
    used: ["BUS 207"],
  },
  "lower-microeconomics": {
    status: "met",
    have: 1,
    need: 1,
    used: ["ECON 103"],
  },
  "lower-macroeconomics": {
    status: "met",
    have: 1,
    need: 1,
    used: ["ECON 105"],
  }, // transfer CR (assumed to meet C-)
  "lower-calculus": { status: "met", have: 1, need: 1, used: ["MATH 157"] }, // best attempt B
  "lower-english-philosophy-literature": {
    status: "met",
    have: 1,
    need: 1,
    used: ["ENGL 112W"],
  },

  // ---------- Upper core ----------
  "upper-bus300": { status: "met", have: 1, need: 1, used: ["BUS 300"] },
  "upper-bus303": { status: "met", have: 1, need: 1, used: ["BUS 303"] },
  "upper-bus312": { status: "in_progress", have: 0, need: 1 },
  "upper-bus343": { status: "in_progress", have: 0, need: 1 },
  "upper-bus360w": { status: "in_progress", have: 0, need: 1 },
  "upper-bus373": { status: "unmet", have: 0, need: 1 },
  "upper-bus393": { status: "in_progress", have: 0, need: 1 },
  "upper-bus478": { status: "unmet", have: 0, need: 1 },
  "upper-bus496": { status: "unmet", have: 0, need: 1 },
  "upper-organization-or-hr": { status: "unmet", have: 0, need: 1 },
  "upper-global": { status: "unmet", have: 0, need: 1 },
  // BUS upper division: BUS 300 (1, P) + BUS 303 (3) = 4; with in-progress 4 + 13 = 17 < 36
  "upper-business-units": { status: "unmet", have: 4, need: 36 },
  "upper-400-courses": { status: "unmet", have: 0, need: 3 },
  "upper-400-sfu": { status: "unmet", have: 0, need: 1 },
  // Finance not complete (BUS 313, 315, electives missing) -> 0 of 1
  "upper-concentration-completion": { status: "unmet", have: 0, need: 1 },
  "upper-concentration-declaration": { status: "not_applicable" }, // out-of-scope

  // ---------- Beedie ----------
  "beedie-bus-gpa-entry": { status: "met", have: 3.12, need: 2.3 },
  "beedie-bus-gpa-graduation": { status: "met", have: 3.12, need: 2.3 },
  "gpa-cum": { status: "met", have: 3.12, need: 2 },
  "gpa-cum-ud": { status: "met", have: 3, need: 2 },
  "gpa-ud-bus": { status: "met", have: 3, need: 2 },
  "gpa-program": { status: "unknown", have: null, need: 2 }, // "program courses" undefined
  "gpa-program-ud": { status: "unknown", have: null, need: 2 },
  "beedie-core-grade": { status: "met", have: 0, need: 0 }, // no core course below C- (P ok on BUS 203/300)
  // Non-BUS/BUEC: ECON 103 4, MATH 157 3, ENGL 112W 3, ECON 105 4, GEOG 100 3, INDG 101 3, HIST 135 3, CMNS 110 3
  "beedie-nonbus": { status: "unmet", have: 26, need: 36 },
  "beedie-upper-total": { status: "unmet", have: 4, need: 45 },
  // Group A (GEOG 100, HIST 135, CMNS 110) + Group B (INDG 101) = 12
  "beedie-nonbus-electives-total": { status: "met", have: 12, need: 9 },
  "beedie-nonbus-group-a": { status: "met", have: 9, need: 6 },
  "beedie-nonbus-group-b": { status: "met", have: 3, need: 3 },
  "beedie-foundation-pathway": { status: "not_applicable" },
  "beedie-residency-total": { status: "not_applicable" },
  "beedie-residency-upper": { status: "not_applicable" },

  // ---------- University ----------
  "univ-total": { status: "unmet", have: 61, need: 120 },
  "univ-upper": { status: "unmet", have: 4, need: 44 },
  "univ-writing": { status: "met", have: 6, need: 6 }, // ENGL 112W 3 + BUS 217W 3
  "univ-writing-course-count": { status: "met", have: 2, need: 2 },
  "univ-writing-lower": { status: "met", have: 2, need: 1 },
  "univ-writing-upper": { status: "in_progress", have: 0, need: 1 }, // BUS 360W in progress
  // Q: ECON 103 4, MATH 157 3, ECON 105 4, BUS 232 3, BUS 207 3, BUS 251 3, BUS 254 3 = 23 (7 courses)
  "univ-quant": { status: "met", have: 23, need: 6 },
  "univ-quant-course-count": { status: "met", have: 7, need: 2 },
  "univ-breadth-social": {
    status: "met",
    have: 7,
    need: 6,
    used: ["CMNS 110", "ECON 105"],
  },
  "univ-breadth-social-course-count": {
    status: "met",
    have: 2,
    need: 2,
    used: ["CMNS 110", "ECON 105"],
  },
  "univ-breadth-humanities": {
    status: "met",
    have: 6,
    need: 6,
    used: ["ENGL 112W", "GEOG 100"],
  },
  "univ-breadth-humanities-course-count": {
    status: "met",
    have: 2,
    need: 2,
    used: ["ENGL 112W", "GEOG 100"],
  },
  "univ-breadth-science": { status: "unmet", have: 0, need: 6 },
  "univ-breadth-science-course-count": { status: "unmet", have: 0, need: 2 },
  "univ-breadth-additional": {
    status: "met",
    have: 7,
    need: 6,
    used: ["ECON 103", "HIST 135"],
  },
  "univ-breadth-additional-course-count": {
    status: "met",
    have: 2,
    need: 2,
    used: ["ECON 103", "HIST 135"],
  },
  "univ-breadth-total": { status: "met", have: 26, need: 24 },
  "univ-breadth-no-double-count": { status: "met", have: 0, need: 0 },
  "univ-wqb-grade": { status: "met", have: 0, need: 0 },
  "univ-second-degree-writing": { status: "not_applicable" },
  "univ-second-degree-quant": { status: "not_applicable" },

  // ---------- Finance (declared) ----------
  "finance-bus313": { status: "unmet", have: 0, need: 1 },
  "finance-bus315": { status: "unmet", have: 0, need: 1 },
  "finance-electives": { status: "unmet", have: 0, need: 3 },

  // ---------- Other concentrations: not declared (25 rows) ----------
  ...Object.fromEntries(
    [
      "accounting-bus320",
      "accounting-bus321",
      "accounting-bus322",
      "accounting-bus421",
      "accounting-electives",
      "innovation-entrepreneurship-bus314",
      "innovation-entrepreneurship-bus338",
      "innovation-entrepreneurship-bus477",
      "innovation-entrepreneurship-electives",
      "human-resource-management-bus374",
      "human-resource-management-bus381",
      "human-resource-management-electives",
      "international-business-bus346",
      "international-business-electives",
      "management-information-systems-bus361",
      "management-information-systems-bus362",
      "management-information-systems-bus468",
      "management-information-systems-electives",
      "marketing-total",
      "marketing-analytics",
      "marketing-consumer-behaviours",
      "operations-management-bus336",
      "operations-management-bus473",
      "operations-management-electives",
      "strategic-analysis-electives",
    ].map((id) => [id, { status: "not_applicable" as const }]),
  ),
};
