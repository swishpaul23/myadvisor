"use server";

import { revalidatePath } from "next/cache";
import { parseStep } from "@/lib/app/onboarding";
import { StateTooLargeError } from "@/lib/app/state-cookie";
import { readState, writeState } from "@/lib/app/store";
import type { ActionResult } from "@/lib/app/types";

/**
 * Academic record: save an edited course list. Same validation as onboarding, and the
 * student must confirm it again. An edited sample record is no longer "sample data".
 */
export async function updateRecord(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep("courses", form);
  if (!parsed.ok) return parsed;
  if (form.get("confirm") !== "on") {
    return {
      ok: false,
      error: "Check your courses, then tick “Reviewed and confirmed”.",
      fieldErrors: { confirm: "Confirm that your course list is correct." },
    };
  }
  const state = await readState();
  if (!state.profile) return { ok: false, error: "Set up your profile first." };
  const courses = parsed.data.courses ?? [];
  try {
    await writeState({
      ...state,
      profile: {
        ...state.profile,
        courses,
        recordConfirmed: true,
        origin: state.profile.origin === "transcript" ? "transcript" : "manual",
      },
    });
  } catch (err) {
    if (err instanceof StateTooLargeError)
      return { ok: false, error: err.message };
    console.error("Saving the academic record failed.");
    return { ok: false, error: "Your courses couldn't be saved. Try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: undefined };
}
