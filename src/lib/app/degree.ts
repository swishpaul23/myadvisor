import "server-only";
import { cache } from "react";
import { audit } from "@/engine/audit";
import type { AuditResult } from "@/engine/audit/types";
import type { RemainingPlan } from "@/engine/plan/remaining";
import { loadReferenceData, type DataSource } from "@/lib/data/source";
import { toEngineStudent } from "./engine-input";
import { planFor } from "./plan-check";
import {
  buildChecklist,
  buildGaps,
  recordSummary,
  source,
  uniqueSources,
  unitsSummary,
  type ChecklistItem,
  type RecordSummary,
  type UnitsSummary,
} from "./present";
import { readState } from "./store";
import type { Gap, Plan, SavedPlan, Source, StudentProfile } from "./types";

// Everything the signed-in screens show, computed once per request: the stored profile ->
// the rules engine (audit + multi-term plan) -> presentation. The engine decides; this
// only wires it up.

export type DegreeView = {
  profile: StudentProfile;
  audit: AuditResult;
  checklist: ChecklistItem[];
  gaps: Gap[];
  units: UnitsSummary;
  record: RecordSummary;
  /** The planner's result: every term from the start term. */
  remaining: RemainingPlan;
  plan: Plan;
  /** Calendar pages behind every requirement and claim shown. */
  sources: Source[];
  dataSource: DataSource;
  dataFallback: boolean;
  /** Units from the course data for the student's own courses (null when unknown). */
  catalogUnits: Record<string, number | null>;
  /** The student's edited plan from My plan, if they saved one. */
  savedPlan: SavedPlan | null;
};

/** null when the student hasn't finished onboarding. */
export const getDegreeView = cache(async (): Promise<DegreeView | null> => {
  const { profile, plan: savedPlan = null } = await readState();
  if (!profile) return null;
  const data = await loadReferenceData();
  const student = toEngineStudent(profile);
  const result = audit(student, data);
  const { remaining, plan } = planFor(profile, data, result);
  const shown = new Set(
    result.results
      .filter((r) => r.status !== "not_applicable")
      .map((r) => r.reqId),
  );
  return {
    profile,
    audit: result,
    checklist: buildChecklist(data.requirements, result),
    gaps: buildGaps(data.requirements, result),
    units: unitsSummary(result),
    record: recordSummary(profile, result, data.courses),
    remaining,
    plan,
    sources: uniqueSources([
      ...data.requirements
        .filter((r) => shown.has(r.req_id))
        .map((r) => source(r.source_url)),
      ...plan.claims.map((c) => c.source),
    ]),
    dataSource: data.source,
    dataFallback: data.fallbackReason !== null,
    savedPlan,
    catalogUnits: Object.fromEntries(
      profile.courses.map((c) => [
        c.code,
        data.courses.find((k) => k.code === c.code)?.units ?? null,
      ]),
    ),
  };
});
