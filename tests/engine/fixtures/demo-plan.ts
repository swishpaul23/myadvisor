import type { Plan } from "@/engine/plan/types";

// Golden plan for the demo student (tests/engine/fixtures/demo-student.ts), 2027-spring to
// 2028-spring. It finishes the Finance BBA and contains deliberate problems:
//   - BUS 410 in the same term as its prerequisite BUS 315 (error)
//   - MATH 338, whose prerequisite this student can only meet by permission (warning)
//   - a co-op term with no courses (valid)
//   - BUS 419 (offered in fall only) planned in spring (warning)
//   - an overloaded last term, 22 units (warning)

export const demoPlan: Plan = {
  terms: [
    {
      id: "2027-spring",
      kind: "study",
      courses: [
        "BUS 313",
        "BUS 315",
        "BUS 373",
        "BUS 374",
        "BUS 410",
        "BPK 140",
      ],
    },
    {
      id: "2027-summer",
      kind: "study",
      courses: ["MATH 338", "GEOG 104", "TEKX 101"],
    },
    { id: "2027-fall", kind: "coop", courses: [] },
    {
      id: "2028-spring",
      kind: "study",
      courses: [
        "BUS 418",
        "BUS 478",
        "BUS 346",
        "BUS 412",
        "BUS 414",
        "PHIL 100W",
        "BUS 419",
        "BUS 496",
      ],
    },
  ],
};
