import type { Student } from "@/engine/audit/types";

// Fictional demo student (no real person). Finance concentration, admitted 2024-fall.
// 61 completed units over 2024-fall .. 2026-summer, 4 courses (13 units) in 2026-fall.
// Built to exercise: one repeat (MATH 157: D then B), one transfer CR course (ECON 105),
// P-graded BUS 203 and BUS 300, and a W course that is also B-Hum (ENGL 112W).
// Units and designations below are what data/generated/courses.json says (2026-10-04).

export const demoStudent: Student = {
  admissionTerm: "2024-fall",
  declaredConcentrations: ["Finance"],
  courses: [
    // 2024-fall: 3 + 1 + 4 + 3 + 3 = 14 units
    {
      code: "BUS 201",
      grade: "B",
      term: "2024-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u
    {
      code: "BUS 203",
      grade: "P",
      term: "2024-fall",
      institution: "SFU",
      status: "completed",
    }, // 1u
    {
      code: "ECON 103",
      grade: "B+",
      term: "2024-fall",
      institution: "SFU",
      status: "completed",
    }, // 4u, Q
    {
      code: "MATH 157",
      grade: "D",
      term: "2024-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u, Q (first attempt)
    {
      code: "ENGL 112W",
      grade: "A-",
      term: "2024-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u, W + B-Hum

    // 2025-spring: 3 + 3 + 0 (repeat) + 4 = 10 new units (24 total)
    {
      code: "BUS 217W",
      grade: "A-",
      term: "2025-spring",
      institution: "SFU",
      status: "completed",
    }, // 3u, W
    {
      code: "BUS 237",
      grade: "B",
      term: "2025-spring",
      institution: "SFU",
      status: "completed",
    }, // 3u
    {
      code: "MATH 157",
      grade: "B",
      term: "2025-spring",
      institution: "SFU",
      status: "completed",
    }, // repeat
    {
      code: "ECON 105",
      grade: "CR",
      term: "2025-spring",
      institution: "transfer",
      status: "completed",
    }, // 4u, Q + B-Soc

    // 2025-summer: 3 (27 total)
    {
      code: "BUS 232",
      grade: "C+",
      term: "2025-summer",
      institution: "SFU",
      status: "completed",
    }, // 3u, Q

    // 2025-fall: 12 (39 total)
    {
      code: "BUS 207",
      grade: "B+",
      term: "2025-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u, Q
    {
      code: "BUS 251",
      grade: "B",
      term: "2025-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u, Q
    {
      code: "BUS 272",
      grade: "B-",
      term: "2025-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u
    {
      code: "GEOG 100",
      grade: "B",
      term: "2025-fall",
      institution: "SFU",
      status: "completed",
    }, // 3u, B-Soc + B-Hum, Group A

    // 2026-spring: 12 (51 total)
    {
      code: "BUS 254",
      grade: "B",
      term: "2026-spring",
      institution: "SFU",
      status: "completed",
    }, // 3u, Q
    {
      code: "BUS 240",
      grade: "B+",
      term: "2026-spring",
      institution: "SFU",
      status: "completed",
    }, // 3u, B-Soc (but BUS = major)
    {
      code: "BUS 275",
      grade: "A",
      term: "2026-spring",
      institution: "SFU",
      status: "completed",
    }, // 3u
    {
      code: "INDG 101",
      grade: "A-",
      term: "2026-spring",
      institution: "SFU",
      status: "completed",
    }, // 3u, B-Soc + B-Hum, Group B

    // 2026-summer: 1 + 3 + 3 + 3 = 10 (61 total)
    {
      code: "BUS 300",
      grade: "P",
      term: "2026-summer",
      institution: "SFU",
      status: "completed",
    }, // 1u
    {
      code: "BUS 303",
      grade: "B",
      term: "2026-summer",
      institution: "SFU",
      status: "completed",
    }, // 3u
    {
      code: "HIST 135",
      grade: "B",
      term: "2026-summer",
      institution: "SFU",
      status: "completed",
    }, // 3u, B-Soc + B-Hum, Group A
    {
      code: "CMNS 110",
      grade: "C",
      term: "2026-summer",
      institution: "SFU",
      status: "completed",
    }, // 3u, B-Soc, Group A

    // 2026-fall, in progress: 3 + 3 + 4 + 3 = 13 units
    {
      code: "BUS 312",
      grade: null,
      term: "2026-fall",
      institution: "SFU",
      status: "in_progress",
    },
    {
      code: "BUS 343",
      grade: null,
      term: "2026-fall",
      institution: "SFU",
      status: "in_progress",
    },
    {
      code: "BUS 360W",
      grade: null,
      term: "2026-fall",
      institution: "SFU",
      status: "in_progress",
    },
    {
      code: "BUS 393",
      grade: null,
      term: "2026-fall",
      institution: "SFU",
      status: "in_progress",
    },
  ],
};
