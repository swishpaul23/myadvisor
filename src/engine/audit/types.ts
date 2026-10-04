import type { Course, UnknownCourse } from "@/lib/data/catalog";
import type { RequirementRow } from "@/lib/data/schema";

// Types for the degree audit. See docs/engine-spec.md. Pure data: the engine never reads
// files; callers pass the catalog and policy in.

export type CourseStatus = "completed" | "in_progress" | "planned";

export type StudentCourse = {
  code: string;
  /** A+..D, F, FD, N, P, W, CR; null while in progress or planned. */
  grade: string | null;
  /** Student-supplied units, used only when courses.json has no units for the code. */
  units?: number;
  term: string;
  institution: "SFU" | "transfer";
  status: CourseStatus;
};

export type Student = {
  /** "2024-fall" */
  admissionTerm: string;
  declaredConcentrations: string[];
  courses: StudentCourse[];
};

/** The parts of data/policy/sfu.json the engine reads. */
export type Policy = {
  grade_points: { points: Record<string, number>; no_grade_points: string[] };
  transfer_credit: { grade: string; counts_in_gpa: boolean };
  wqb_min_grade: { min_grade: string };
  grade_order: { letter_grades: string[]; earns_units: string[] };
  major_subjects: { subjects: string[] };
  bus_gpa_subjects: { subjects: string[] };
  pass_fail_courses: { courses: string[] };
  admission_gated_courses: { courses: string[]; from_term: string };
};

export type Catalog = {
  requirements: RequirementRow[];
  courses: Course[];
  unknownCourses: UnknownCourse[];
  policy: Policy;
};

export type AuditOptions = {
  /** Count planned courses alongside in-progress ones (plan validator). */
  includePlanned?: boolean;
};

export type ReqStatus =
  "met" | "unmet" | "in_progress" | "unknown" | "not_applicable";

export type ProgressUnit =
  "courses" | "units" | "gpa" | "concentrations" | "violations";

export type ReqResult = {
  reqId: string;
  status: ReqStatus;
  /** From completed courses only; `have` is null when it can't be computed (unknown GPA). */
  progress: { have: number | null; need: number; unit: ProgressUnit };
  usedCourses: string[];
  missing: string[];
  notes: string[];
  sourceUrl: string;
  dataStatus: RequirementRow["status"];
};

export type AuditResult = {
  results: ReqResult[];
  summary: {
    byStatus: Record<ReqStatus, number>;
    /** Units earned by completed courses, each course counted once. */
    earnedUnits: number;
    /** Units of in-progress (and, with includePlanned, planned) courses not yet earned. */
    inProgressUnits: number;
    /** GPA by row id for every minimum-GPA row; null when unknown or no graded courses. */
    gpas: Record<string, number | null>;
    declaredConcentrations: string[];
  };
  unknowns: { reqId: string; reason: string }[];
};
