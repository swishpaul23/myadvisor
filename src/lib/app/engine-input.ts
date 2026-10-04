import type { Student } from "@/engine/audit/types";
import type { RemainingOptions, SummerChoice } from "@/engine/plan/remaining";
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

/** The multi-term planner's options from the profile. */
export function toPlanOptions(profile: StudentProfile): RemainingOptions {
  return {
    startTerm: profile.planTerm,
    courseLoad: profile.courseLoad,
    summer: summerChoice(profile).summer,
    coopTerms: [],
  };
}
