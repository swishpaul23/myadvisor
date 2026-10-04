"use server";

import { revalidatePath } from "next/cache";
import { parseStep } from "@/lib/app/onboarding";
import { StateTooLargeError } from "@/lib/app/state-cookie";
import { readState, writeState } from "@/lib/app/store";
import type { ActionResult } from "@/lib/app/types";

/** Summer answers the plan settings can save (the intake question's options). */
const SUMMER = ["full", "some", "no", "unsure"];

/**
 * My plan: change the start term, the course load and summer terms. The plan is recomputed
 * by the rules engine on the next render; nothing else in the profile changes.
 */
export async function updatePlanSettings(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep("next-term", form);
  if (!parsed.ok) return parsed;
  const summer = form.get("summer");
  if (summer !== null && !SUMMER.includes(String(summer)))
    return {
      ok: false,
      error: "Some answers need fixing. See the highlighted fields.",
      fieldErrors: { summer: "Pick a summer option." },
    };
  const state = await readState();
  if (!state.profile) return { ok: false, error: "Set up your profile first." };
  const profile = state.profile;
  try {
    await writeState({
      ...state,
      profile: {
        ...profile,
        ...parsed.data,
        ...(summer === null
          ? {}
          : {
              surveyAnswers: {
                ...profile.surveyAnswers,
                summer: String(summer),
              },
            }),
      },
    });
  } catch (err) {
    if (err instanceof StateTooLargeError)
      return { ok: false, error: err.message };
    console.error("Saving plan settings failed.");
    return { ok: false, error: "Your change couldn't be saved. Try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: undefined };
}
