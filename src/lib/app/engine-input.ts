import type { Student } from "@/engine/audit/types";
import { defaultCoopTerms } from "@/engine/plan/coop";
import type { RemainingOptions, SummerChoice } from "@/engine/plan/remaining";
import { termIndex } from "./terms";
import type { StudentProfile } from "./types";

// The only bridge from the app's profile to the rules engine's input. Survey answers never
// reach a requirement decision; only the summer answer shapes the plan (which terms to fill).

export function toEngineStudent(profile: StudentProfile): Student {
  return {
    program: profile.program,
    admissionTerm: profile.admissionTerm,
    declaredConcentrations: [...profile.concentrations],
    courses: profile.courses.map((c) => ({
      code: c.code,
      grade: c.grade,
      ...(c.units === null ? {} : { units: c.units }),
      term: c.term,
      institution: c.institution,
      status: c.status,
    })),
  };
}

/** Summer answer -> summer study terms. "Not sure" or skipped: none, with a note. */
export function summerChoice(profile: StudentProfile): {
  summer: SummerChoice;
  unsure: boolean;
} {
  const answer = profile.surveyAnswers.summer;
  if (answer === "full") return { summer: "full", unsure: false };
  if (answer === "some") return { summer: "some", unsure: false };
  return { summer: "none", unsure: answer !== "no" };
}

/**
 * Co-op work terms for the plan: the student's picks from the start term on, or, when they
 * are doing co-op but none of their picks is left (none picked, or the start term moved past
 * them), the default placement (engine/plan/coop.ts).
 */
export function coopTerms(profile: StudentProfile): {
  terms: string[];
  isDefault: boolean;
} {
  if (!profile.coop.doing) return { terms: [], isDefault: false };
  const picked = profile.coop.workTerms.filter(
    (t) => termIndex(t) >= termIndex(profile.planTerm),
  );
  if (picked.length === 0)
    return {
      terms: defaultCoopTerms(profile.planTerm, summerChoice(profile).summer),
      isDefault: true,
    };
  return { terms: picked, isDefault: false };
}

/** The multi-term planner's options from the profile. */
export function toPlanOptions(profile: StudentProfile): RemainingOptions {
  return {
    startTerm: profile.planTerm,
    courseLoad: profile.courseLoad,
    summer: summerChoice(profile).summer,
    coopTerms: coopTerms(profile).terms,
  };
}
