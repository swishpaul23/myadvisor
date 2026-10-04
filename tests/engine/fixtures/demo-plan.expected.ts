import type { ReqStatus } from "@/engine/audit/types";
import type { Severity, ViolationCode } from "@/engine/plan/types";

// Expected validation of tests/engine/fixtures/demo-plan.ts for the demo student, worked
// out BY HAND from data/generated/{prereqs,offerings,courses,requirements}.json and
// docs/validator-spec.md before the validator was written (2026-10-04). Do not edit these
// values to match engine output: if they disagree, decide which side is wrong.
//
// Starting point: 61 completed units + 13 in progress (BUS 312, 343, 360W, 393, assumed
// passed before 2027-spring) = 74 units. SFU BUS GPA 3.12 >= 2.30, so no ENTRY_GPA.
//
// 2027-spring (18u = 6 x 3; within 9..18). Units before: 74.
//   BUS 313  all(BUS 312 [in progress], any(BUS 207 B+), 45u)                       met
//   BUS 315  any(all(BUS 312, BUS 207, 45u), alt_group actuarial)                  met (alt_group noted)
//   BUS 373  all(any(BUS 232 C+ ...), 45u)                                          met
//   BUS 374  any(all(45u, BUS 272 B-), alt_group minor)                             met
//   BUS 410  all(BUS 315[C-] (same term, not concurrent -> unmet), BUS 360W, 60u)    PREREQ_UNMET error
//   BPK 140  no prerequisite
//   Offerings (spring window 2026-spring, 2025-spring): all six ran in spring.
// 2027-summer (9u). Units before: 92.
//   MATH 338 any(MATH 340, MATH 332, permission{instructor}) -> only permission      PREREQ_NEEDS_PERMISSION warning
//   GEOG 104, TEKX 101: no prerequisite
//   Offerings (summer window 2026-summer, 2025-summer): MATH 338 ran 2025-summer; others ran.
// 2027-fall: co-op, no courses: nothing to check.
// 2028-spring (8 courses, 7 x 3 + BUS 496 1 = 22u > 18). Units before: 101.
//   BUS 418/412/414/419: all(BUS 315 [2027-spring], BUS 360W, 60u) (+ BUS 313 for 412)  met
//   BUS 478  all(any(BUS 207), BUS 312, BUS 343, BUS 360W, any(BUS 374 [2027-spring]), 90u: 101)  met
//   BUS 346  45u                                                                    met
//   BUS 496  all(restriction "...in Fall 2022 and onward" -> BBA admitted 2024-fall: met,
//            BUS 300 P (pass/fail course), BUS 360W, 95u: 101)                       met
//   PHIL 100W: no prerequisite
//   Offerings (spring window for 2028: 2027-spring is future-only, so 2026-spring):
//     BUS 419 ran fall only (2025-fall, 2026-fall), no spring future -> NOT_OFFERED_RECENTLY warning
//     BUS 412 ran 2026-spring; the others ran in spring.
//   Load 22 > 18 -> UNIT_LOAD_HIGH warning
//
// Graduation (audit with plan courses as planned, includePlanned):
//   after 2027-spring: 92 units < 120; after 2027-summer / 2027-fall: 101 < 120;
//   after 2028-spring: 123 units; 54 upper; 41 non-BUS; B-Sci (BPK 140, GEOG 104);
//   Finance (313, 315, electives 410/412/414/418/419); BUS 373, 374, 346, 478, 496;
//   3+ BUS 400-level at SFU -> every row met except gpa-program and gpa-program-ud (unknown).
//   Strict graduation term: none (two unknown rows). Excluding unknown: 2028-spring.

export type ExpectedViolation = {
  severity: Severity;
  code: ViolationCode;
  courseCode: string | null;
  termId: string;
};

export const expectedViolations: ExpectedViolation[] = [
  {
    severity: "error",
    code: "PREREQ_UNMET",
    courseCode: "BUS 410",
    termId: "2027-spring",
  },
  {
    severity: "warning",
    code: "PREREQ_NEEDS_PERMISSION",
    courseCode: "MATH 338",
    termId: "2027-summer",
  },
  {
    severity: "warning",
    code: "NOT_OFFERED_RECENTLY",
    courseCode: "BUS 419",
    termId: "2028-spring",
  },
  {
    severity: "warning",
    code: "UNIT_LOAD_HIGH",
    courseCode: null,
    termId: "2028-spring",
  },
];

export const expectedTerms = [
  { id: "2027-spring", units: 18, cumulativeUnits: 92 },
  { id: "2027-summer", units: 9, cumulativeUnits: 101 },
  { id: "2027-fall", units: 0, cumulativeUnits: 101 },
  { id: "2028-spring", units: 22, cumulativeUnits: 123 },
];

export const expectedGraduation = {
  graduationTerm: null,
  graduationTermExcludingUnknown: "2028-spring",
  graduationAssumesValidPlan: true, // the plan has an error (BUS 410)
  graduationBlockers: [
    { reqId: "gpa-program", status: "unknown" as ReqStatus },
    { reqId: "gpa-program-ud", status: "unknown" as ReqStatus },
  ],
  // Completed courses unchanged: the same 40 rows met as in the demo audit; every other
  // applicable row is met only with planned courses (in_progress); 2 unknown; 31 n/a.
  auditByStatus: {
    met: 40,
    in_progress: 23,
    unmet: 0,
    unknown: 2,
    not_applicable: 31,
  },
};
