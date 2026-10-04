import type { Student } from "@/engine/audit/types";
import type { StudentProfile } from "./types";

// The only bridge from the app's profile to the rules engine's input. Survey answers are
// deliberately not passed: they shape the advisor chat, never a requirement decision.

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
