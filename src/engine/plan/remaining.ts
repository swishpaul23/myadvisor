import type { ReqStatus, Student } from "../audit/types";
import type {
  Declarations,
  Plan,
  PlanCatalog,
  PlanValidation,
  ViolationCode,
} from "./types";

// Multi-term plan: every remaining term from the start term until the remaining
// requirements are planned. Not implemented yet (tests in tests/engine/plan-remaining.test.ts
// were written first).

/** Summer study terms: a full load, up to two courses, or none. */
export type SummerChoice = "full" | "some" | "none";

export type RemainingOptions = {
  /** The first term of the plan, always planned (e.g. "2027-spring"). */
  startTerm: string;
  /** Courses per study term (summer "some" caps it at 2). */
  courseLoad: number;
  summer: SummerChoice;
  /** Co-op work terms: planned empty. Consecutive work terms are allowed. */
  coopTerms: string[];
  /** Safety cap on the number of terms (default 24). */
  maxTerms?: number;
};

/** What a placeholder elective must be, read from the requirement rows it is for. */
export type ElectiveSlot = {
  /** "400": BUS 400-499; "upper": 300-499; "lower": 100-299; null: any level. */
  level: "lower" | "upper" | "400" | null;
  /** true: a BUS course; false: outside BUS; null: either. */
  business: boolean | null;
  /** W, Q, B-Soc, B-Hum or B-Sci, or null. */
  designation: string | null;
  /** A row whose course list the course must come from, or null. */
  fromList: string | null;
};

export type PlanItem =
  | {
      kind: "course";
      code: string;
      /** Requirement rows this course is planned for. */
      reqIds: string[];
      /** One option picked from a list; the student may swap it for another. */
      choice: boolean;
    }
  | { kind: "elective"; slot: ElectiveSlot; reqIds: string[] };

export type RemainingTerm = {
  id: string;
  kind: "study" | "coop";
  items: PlanItem[];
};

export type RemainingPlan = {
  terms: RemainingTerm[];
  /** Named courses no term could take, with the validator's reasons. */
  unscheduled: { code: string; reqIds: string[]; reasons: ViolationCode[] }[];
  /** Rows that adding courses can't satisfy (GPA, unknowns), still open after the plan. */
  notPlannable: { reqId: string; status: ReqStatus }[];
  /** The named courses by term, as validated. */
  plan: Plan;
  validation: PlanValidation;
};

export function planRemaining(
  student: Student,
  catalog: PlanCatalog,
  options: RemainingOptions,
  declarations: Declarations = {},
): RemainingPlan {
  void student;
  void catalog;
  void options;
  void declarations;
  throw new Error("planRemaining is not implemented yet.");
}
