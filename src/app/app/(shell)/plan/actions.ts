"use server";

import { revalidatePath } from "next/cache";
import { parseStep } from "@/lib/app/onboarding";
import { StateTooLargeError } from "@/lib/app/state-cookie";
import { readState, writeState } from "@/lib/app/store";
import type { ActionResult } from "@/lib/app/types";

/**
 * My plan: change the term to plan and the course load. The suggestion is recomputed by the
 * rules engine on the next render; nothing else in the profile changes.
 */
export async function updatePlanSettings(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep("next-term", form);
  if (!parsed.ok) return parsed;
  const state = await readState();
  if (!state.profile) return { ok: false, error: "Set up your profile first." };
  try {
    await writeState({
      ...state,
      profile: { ...state.profile, ...parsed.data },
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
