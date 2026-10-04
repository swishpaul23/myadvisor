import { z } from "zod";
import { MOCK_SURVEY_QUESTIONS, SKIP } from "./mocks";
import {
  coursesSchema,
  profileSchema,
  SEASONS,
  type ActionResult,
  type OnboardingDraft,
  type StudentProfile,
} from "./types";

// The onboarding steps and their validation, as plain functions (server actions call them;
// tests cover them). A draft is saved after every step, so a student can leave and resume.

export const STEPS = [
  { slug: "program", title: "Your program" },
  { slug: "next-term", title: "Your next term" },
  { slug: "courses", title: "Your courses" },
  { slug: "questions", title: "A few questions" },
  { slug: "review", title: "Review and confirm" },
] as const;
export type StepSlug = (typeof STEPS)[number]["slug"];

export const stepIndex = (slug: StepSlug) =>
  STEPS.findIndex((s) => s.slug === slug);

export function isStepSlug(value: string): value is StepSlug {
  return STEPS.some((s) => s.slug === value);
}

const programStep = profileSchema.pick({
  admissionTerm: true,
  concentrations: true,
});
const nextTermStep = profileSchema.pick({ planTerm: true, courseLoad: true });
const coursesStep = z.object({
  courses: coursesSchema.min(
    1,
    "Add at least one course, or upload a transcript.",
  ),
});

/** Whether a step's answers are already in the draft. */
export function isStepDone(
  draft: OnboardingDraft | null,
  slug: StepSlug,
): boolean {
  if (!draft) return false;
  switch (slug) {
    case "program":
      return programStep.safeParse(draft).success;
    case "next-term":
      return nextTermStep.safeParse(draft).success;
    case "courses":
      return coursesStep.safeParse(draft).success;
    case "questions":
      return MOCK_SURVEY_QUESTIONS.every(
        (q) => draft.surveyAnswers?.[q.id] !== undefined,
      );
    case "review":
      return draft.recordConfirmed === true;
  }
}

/** The first step still to do (where "Continue" resumes). */
export function firstOpenStep(draft: OnboardingDraft | null): StepSlug {
  return (STEPS.find((s) => !isStepDone(draft, s.slug)) ?? STEPS[4]).slug;
}

/** Index of the first unanswered survey question (3 when all are answered). */
export function nextQuestionIndex(draft: OnboardingDraft | null): number {
  const i = MOCK_SURVEY_QUESTIONS.findIndex(
    (q) => draft?.surveyAnswers?.[q.id] === undefined,
  );
  return i === -1 ? MOCK_SURVEY_QUESTIONS.length : i;
}

/** zod issues -> { "courses.2.grade": "message" }, first message per field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

const fail = (error: z.ZodError): ActionResult<never> => ({
  ok: false,
  error: "Some answers need fixing. See the highlighted fields.",
  fieldErrors: fieldErrors(error),
});

const str = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

/** Reads one step's form fields into the part of the draft that step owns. */
export function parseStep(
  slug: Exclude<StepSlug, "questions" | "review">,
  form: FormData,
): ActionResult<Partial<OnboardingDraft>> {
  if (slug === "program") {
    // Two answers, season and year, make the admission term ("2023-fall").
    const season = str(form, "admissionSeason");
    const year = str(form, "admissionYear");
    const seasonOk = (SEASONS as readonly string[]).includes(season);
    const yearOk = /^\d{4}$/.test(year);
    const result = programStep.safeParse({
      admissionTerm: seasonOk && yearOk ? `${year}-${season}` : "",
      concentrations: form.getAll("concentrations").map(String),
    });
    if (result.success) return { ok: true, data: result.data };
    const errors = fieldErrors(result.error);
    delete errors.admissionTerm; // reported per field below
    return {
      ok: false,
      error: "Some answers need fixing. See the highlighted fields.",
      fieldErrors: {
        ...(seasonOk
          ? {}
          : { admissionSeason: "Pick the season you were admitted." }),
        ...(yearOk
          ? {}
          : { admissionYear: "Pick the year you were admitted." }),
        ...errors,
      },
    };
  }
  if (slug === "next-term") {
    const result = nextTermStep.safeParse({
      planTerm: str(form, "planTerm"),
      courseLoad: Number(str(form, "courseLoad")) || 0,
    });
    return result.success
      ? { ok: true, data: result.data }
      : fail(result.error);
  }
  let courses: unknown;
  try {
    courses = JSON.parse(str(form, "courses") || "[]");
  } catch {
    return { ok: false, error: "The course list couldn't be read. Try again." };
  }
  const result = coursesStep.safeParse({ courses });
  return result.success
    ? {
        ok: true,
        // Edited courses need a fresh review before they're confirmed.
        data: {
          courses: result.data.courses,
          origin: "manual",
          recordConfirmed: false,
        },
      }
    : fail(result.error);
}

/** Validates one survey answer: one of the question's 4 options, or Skip. */
export function parseAnswer(
  form: FormData,
): ActionResult<{ questionId: string; answer: string }> {
  const questionId = str(form, "questionId");
  const answer = str(form, "answer");
  const question = MOCK_SURVEY_QUESTIONS.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: "That question isn't available." };
  if (answer !== SKIP && !question.options.some((o) => o.id === answer)) {
    return {
      ok: false,
      error: "Pick an option, or Skip.",
      fieldErrors: { answer: "Pick an option, or Skip." },
    };
  }
  return { ok: true, data: { questionId, answer } };
}

/** The finished profile, or the first problem that stops it. */
export function draftToProfile(
  draft: OnboardingDraft | null,
): ActionResult<StudentProfile> {
  const open = firstOpenStep(draft);
  if (open !== "review" || !draft) {
    return {
      ok: false,
      error: `Finish "${STEPS[stepIndex(open)]!.title}" first.`,
    };
  }
  // profileSchema drops the draft-only `step` key.
  const result = profileSchema.safeParse({
    program: "BBA",
    origin: "manual",
    surveyAnswers: {},
    ...draft,
    recordConfirmed: true,
  });
  return result.success ? { ok: true, data: result.data } : fail(result.error);
}
