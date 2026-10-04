import type { RecordCourse, StudentProfile } from "./types";

// "Try the sample student": a fictional BBA Finance student (no real person). The same
// course record as the engine's hand-checked demo student (tests/engine/fixtures/
// demo-student.ts; a test keeps them equal). It is saved through the same pipeline as a
// real student's profile.

type Row = [
  code: string,
  term: string,
  grade: RecordCourse["grade"],
  institution?: RecordCourse["institution"],
];

const completed: Row[] = [
  ["BUS 201", "2024-fall", "B"],
  ["BUS 203", "2024-fall", "P"],
  ["ECON 103", "2024-fall", "B+"],
  ["MATH 157", "2024-fall", "D"],
  ["ENGL 112W", "2024-fall", "A-"],
  ["BUS 217W", "2025-spring", "A-"],
  ["BUS 237", "2025-spring", "B"],
  ["MATH 157", "2025-spring", "B"],
  ["ECON 105", "2025-spring", "CR", "transfer"],
  ["BUS 232", "2025-summer", "C+"],
  ["BUS 207", "2025-fall", "B+"],
  ["BUS 251", "2025-fall", "B"],
  ["BUS 272", "2025-fall", "B-"],
  ["GEOG 100", "2025-fall", "B"],
  ["BUS 254", "2026-spring", "B"],
  ["BUS 240", "2026-spring", "B+"],
  ["BUS 275", "2026-spring", "A"],
  ["INDG 101", "2026-spring", "A-"],
  ["BUS 300", "2026-summer", "P"],
  ["BUS 303", "2026-summer", "B"],
  ["HIST 135", "2026-summer", "B"],
  ["CMNS 110", "2026-summer", "C"],
];

const inProgress = ["BUS 312", "BUS 343", "BUS 360W", "BUS 393"];

export const SAMPLE_PROFILE: StudentProfile = {
  program: "BBA",
  admissionTerm: "2024-fall",
  concentrations: ["Finance"],
  planTerm: "2027-spring",
  courseLoad: 4,
  coop: { doing: false, workTerms: [] },
  courses: [
    ...completed.map(
      ([code, term, grade, institution = "SFU"]): RecordCourse => ({
        code,
        term,
        status: "completed",
        grade,
        institution,
        units: null,
      }),
    ),
    ...inProgress.map((code): RecordCourse => ({
      code,
      term: "2026-fall",
      status: "in_progress",
      grade: null,
      institution: "SFU",
      units: null,
    })),
  ],
  origin: "sample",
  recordConfirmed: true,
  surveyAnswers: {},
};
