import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import type { AuditResult, Catalog, ReqStatus } from "../audit/types";

// Types for the plan validator. See docs/validator-spec.md.

export type PlanTerm = {
  /** "2027-spring" */
  id: string;
  kind: "study" | "coop";
  courses: string[];
};

export type Plan = { terms: PlanTerm[] };

export type PlanCatalog = Catalog & {
  offerings: Record<string, CourseOfferings>;
  prereqs: PrereqRecord[];
};

/** The student's answers to external prerequisite nodes, keyed by the node's exact text. */
export type Declarations = { external?: Record<string, boolean> };

export type Severity = "error" | "warning" | "unknown";

export type ViolationCode =
  | "PREREQ_UNMET"
  | "PREREQ_NEEDS_PERMISSION"
  | "PREREQ_UNKNOWN"
  | "COREQ_UNMET"
  | "COREQ_UNKNOWN"
  | "NOT_OFFERED_FUTURE_ONLY"
  | "NOT_OFFERED_RECENTLY"
  | "NO_COURSE_DATA"
  | "DUPLICATE_IN_PLAN"
  | "ALREADY_TAKEN"
  | "UNIT_LOAD_HIGH"
  | "UNIT_LOAD_LOW"
  | "COURSES_IN_COOP_TERM"
  | "ENTRY_GPA"
  | "PLAN_TERM_ORDER";

export type Violation = {
  severity: Severity;
  code: ViolationCode;
  courseCode: string | null;
  termId: string;
  message: string;
  sourceUrl: string | null;
};

export type PlanValidation = {
  /** Sorted by term order, then course code, then code. */
  violations: Violation[];
  terms: { id: string; units: number | null; cumulativeUnits: number | null }[];
  /** First term after which every applicable requirement is met; unknown rows block it. */
  graduationTerm: string | null;
  /** Same, but unknown rows don't block (only unmet rows do). Shows what the plan achieves
   * apart from rules the data can't decide. */
  graduationTermExcludingUnknown: string | null;
  /** True when the plan has error violations: the graduation terms assume it is fixed. */
  graduationAssumesValidPlan: boolean;
  /** Rows still unmet or unknown after the whole plan. */
  graduationBlockers: { reqId: string; status: ReqStatus }[];
  auditAfterPlan: AuditResult;
};
