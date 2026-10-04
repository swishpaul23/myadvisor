"use server";

import { redirect } from "next/navigation";
import {
  draftToProfile,
  firstOpenStep,
  parseAnswer,
  parseStep,
  stepIndex,
  STEPS,
  type StepSlug,
} from "@/lib/app/onboarding";
import { MOCK_SURVEY_QUESTIONS } from "@/lib/app/mocks";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import { StateTooLargeError } from "@/lib/app/state-cookie";
import { readState, writeState } from "@/lib/app/store";
import type { ActionResult, AppState } from "@/lib/app/types";

// Onboarding server actions. Each reads the signed-in student's state (store.ts calls
// requireUser()), validates the step, saves the draft and moves on.

async function save(state: AppState): Promise<ActionResult<never> | null> {
  try {
    await writeState(state);
    return null;
  } catch (err) {
    if (err instanceof StateTooLargeError)
      return { ok: false, error: err.message };
    console.error("Saving onboarding state failed.");
    return { ok: false, error: "Your answers couldn't be saved. Try again." };
  }
}

const nextSlug = (slug: StepSlug) =>
  STEPS[Math.min(stepIndex(slug) + 1, STEPS.length - 1)]!.slug;

/** Program, next-term and courses steps. */
export async function saveStep(
  slug: "program" | "next-term" | "courses",
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep(slug, form);
  if (!parsed.ok) return parsed;
  const state = await readState();
  const draft = {
    ...(state.draft ?? { step: 0 }),
    ...parsed.data,
  };
  draft.step = Math.max(draft.step, stepIndex(slug) + 1);
  const failed = await save({ ...state, draft });
  if (failed) return failed;
  redirect(`/app/start/${nextSlug(slug)}`);
}

/**
 * Transcript review: the student fixed any rows and ticked "Reviewed and confirmed". The
 * courses replace the draft's list (same validation as manual entry) and onboarding
 * continues at the first unfinished step.
 */
export async function saveTranscriptReview(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep("courses", form);
  if (!parsed.ok) return parsed;
  if (form.get("confirm") !== "on") {
    return {
      ok: false,
      error: "Check each course, then tick “Reviewed and confirmed”.",
      fieldErrors: { confirm: "Confirm you've checked every course." },
    };
  }
  const state = await readState();
  const draft = {
    ...(state.draft ?? { step: 0 }),
    ...parsed.data,
    origin: "transcript" as const,
    recordConfirmed: true,
  };
  draft.step = Math.max(draft.step, stepIndex("courses") + 1);
  const failed = await save({ ...state, draft });
  if (failed) return failed;
  redirect(`/app/start/${firstOpenStep(draft)}`);
}

/** One survey answer (or Skip), saved as soon as it's given. */
export async function saveAnswer(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseAnswer(form);
  if (!parsed.ok) return parsed;
  const state = await readState();
  const draft = state.draft ?? { step: 0 };
  const failed = await save({
    ...state,
    draft: {
      ...draft,
      surveyAnswers: {
        ...draft.surveyAnswers,
        [parsed.data.questionId]: parsed.data.answer,
      },
    },
  });
  if (failed) return failed;
  const next =
    MOCK_SURVEY_QUESTIONS.findIndex((q) => q.id === parsed.data.questionId) + 1;
  redirect(
    next < MOCK_SURVEY_QUESTIONS.length
      ? `/app/start/questions?q=${next}`
      : "/app/start/review",
  );
}

/** Review step: the student confirms their course list; the profile is saved. */
export async function finishOnboarding(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  if (form.get("confirm") !== "on") {
    return {
      ok: false,
      error: "Check your courses, then tick the box to confirm them.",
      fieldErrors: { confirm: "Confirm that your course list is correct." },
    };
  }
  const state = await readState();
  const profile = draftToProfile(
    state.draft && { ...state.draft, recordConfirmed: true },
  );
  if (!profile.ok) return profile;
  const failed = await save({ ...state, profile: profile.data, draft: null });
  if (failed) return failed;
  redirect("/app");
}

/** "Try the sample student": the fixed sample profile, saved like any other profile. */
export async function loadSampleStudent(): Promise<ActionResult> {
  const state = await readState();
  const failed = await save({ ...state, profile: SAMPLE_PROFILE, draft: null });
  if (failed) return failed;
  redirect("/app");
}
