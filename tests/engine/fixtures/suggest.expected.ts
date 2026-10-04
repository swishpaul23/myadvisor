import type { ViolationCode } from "@/engine/plan/types";

// Expected suggestNextTerm() results, worked out BY HAND from data/generated/*.json and the
// rule below before suggest.ts was written (2026-10-04). Do not edit these values to match
// engine output: if they disagree, decide which side is wrong.
//
// Rule (decided by Stuart): candidates are the courses of unmet requirement rows that name
// exactly one course ("one course" with a single listed course; there are no "all of" rows),
// in sheet order, each code once. A candidate is chosen when, on its own in the plan term,
// validatePlan reports no violation for it (prerequisites met, offered that season, course
// data present, not already taken). Rows with a choice of courses ("one course" with several
// options, "n courses") are not candidates: they stay open slots ("Your choice"). Chosen
// courses fill up to the course load; the rest are open slots.
//
// ---------- Demo student, 2027-spring ----------
// Units before 2027-spring: 61 completed + 13 in progress (assumed passed) = 74.
// Unmet single-course rows in sheet order: upper-bus373 (row 20), upper-bus478 (22),
// upper-bus496 (23), finance-bus313 (68), finance-bus315 (69). (upper-organization-or-hr and
// upper-global have several options; finance-electives is "n courses".)
//   BUS 373  BUS 232 C+ >= C-, 74 >= 45 units; ran 2025-spring, 2026-spring      chosen
//   BUS 478  needs BUS 374 or 381 (neither taken) and 90 units (74)              PREREQ_UNMET
//   BUS 496  restriction met (BBA, 2024-fall), BUS 300 P, BUS 360W in progress;
//            95 units (74)                                                       PREREQ_UNMET
//   BUS 313  BUS 312 in progress, BUS 207 B+, 45 units; ran 2026-spring            chosen
//   BUS 315  BUS 312 and BUS 207, 45 units (alt_group noted, no violation); ran    chosen
// Plan term holds BUS 373, BUS 313, BUS 315: 3 + 3 + 3 = 9 units, cumulative 83.
// Unit load spring min 9, max 18: 9 is not below 9, so no UNIT_LOAD warning.

export type ExpectedSuggestion = {
  courses: { code: string; reqIds: string[] }[];
  openSlots: number;
  skipped: { code: string; reqIds: string[]; reasons: ViolationCode[] }[];
  violations: string[]; // "severity CODE course term"
  units: number | null;
  cumulativeUnits: number | null;
};

const demoChosen = [
  { code: "BUS 373", reqIds: ["upper-bus373"] },
  { code: "BUS 313", reqIds: ["finance-bus313"] },
  { code: "BUS 315", reqIds: ["finance-bus315"] },
];
const demoSkipped: ExpectedSuggestion["skipped"] = [
  { code: "BUS 478", reqIds: ["upper-bus478"], reasons: ["PREREQ_UNMET"] },
  { code: "BUS 496", reqIds: ["upper-bus496"], reasons: ["PREREQ_UNMET"] },
];

export const expectedDemo: Record<
  "load4" | "load2" | "load6",
  ExpectedSuggestion
> = {
  // Course load 4: three courses fit, one open slot.
  load4: {
    courses: demoChosen,
    openSlots: 1,
    skipped: demoSkipped,
    violations: [],
    units: 9,
    cumulativeUnits: 83,
  },
  // Course load 2: the first two candidates; 6 units < 9 -> UNIT_LOAD_LOW warning.
  load2: {
    courses: demoChosen.slice(0, 2),
    openSlots: 0,
    skipped: demoSkipped,
    violations: ["warning UNIT_LOAD_LOW - 2027-spring"],
    units: 6,
    cumulativeUnits: 80,
  },
  // Course load 6: the same three courses, three open slots.
  load6: {
    courses: demoChosen,
    openSlots: 3,
    skipped: demoSkipped,
    violations: [],
    units: 9,
    cumulativeUnits: 83,
  },
};

// ---------- Synthetic catalog, 2026-fall, course load 3 ----------
// Rows (sheet order), all "one course" unless noted; the student completed AAA 104 (B,
// 2025-fall, 3 units). Confirmed offering terms in the data: 2025-fall, 2025-spring, so the
// 2026-fall window is [2025-fall].
//   r1 AAA 101                    no prerequisite, ran 2025-fall                     chosen
//   r2 AAA 201                    prerequisite is an unknown node                    PREREQ_UNKNOWN
//   r3 AAA 102 | AAA 103          a choice of courses                                not a candidate
//   r4 AAA 301                    ran 2025-spring only                               NOT_OFFERED_RECENTLY
//   r5 AAA 101                    same course as r1                                  (merged into r1)
//   r6 AAA 104                    met (completed)                                    not a candidate
//   r7 AAA 105                    needs AAA 101 earlier; AAA 101 is not taken yet   PREREQ_UNMET
//   r8 n courses AAA 106, AAA 107  a choice of courses                               not a candidate
//   r9 AAA 108                    prerequisite is instructor permission only         PREREQ_NEEDS_PERMISSION
// Plan term holds AAA 101 only: 3 units < fall min 9 -> UNIT_LOAD_LOW warning.
// Cumulative: 3 earned + 3 = 6.
export const expectedSynthetic: ExpectedSuggestion = {
  courses: [{ code: "AAA 101", reqIds: ["r1", "r5"] }],
  openSlots: 2,
  skipped: [
    { code: "AAA 201", reqIds: ["r2"], reasons: ["PREREQ_UNKNOWN"] },
    { code: "AAA 301", reqIds: ["r4"], reasons: ["NOT_OFFERED_RECENTLY"] },
    { code: "AAA 105", reqIds: ["r7"], reasons: ["PREREQ_UNMET"] },
    { code: "AAA 108", reqIds: ["r9"], reasons: ["PREREQ_NEEDS_PERMISSION"] },
  ],
  violations: ["warning UNIT_LOAD_LOW - 2026-fall"],
  units: 3,
  cumulativeUnits: 6,
};
