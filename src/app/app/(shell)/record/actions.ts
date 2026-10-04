"use server";

import { revalidatePath } from "next/cache";
import { parseStep } from "@/lib/app/onboarding";
import { applyMerge, type MergeMode } from "@/lib/app/record-merge";
import { StateTooLargeError } from "@/lib/app/state-cookie";
import { readState, writeState } from "@/lib/app/store";
import { MAX_COURSES, type ActionResult } from "@/lib/app/types";

/**
 * Academic record: save an edited course list, the one place to edit it after onboarding.
 * Same validation as onboarding; the list was confirmed once in onboarding, so saving the
 * student's own edit needs no second confirmation. An edited sample record is no longer
 * "sample data".
 */
export async function updateRecord(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep("courses", form);
  if (!parsed.ok) return parsed;
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

const MODES = ["merge", "replace"] as const;

/**
 * Academic record: a reviewed transcript upload merged into the course list. "merge" (the
 * default) adds new courses and updates changed ones; only an explicit "replace" removes
 * courses. Same row validation as onboarding, and the same confirmation tick.
 */
export async function importTranscript(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const parsed = parseStep("courses", form);
  if (!parsed.ok) return parsed;
  if (form.get("confirm") !== "on")
    return {
      ok: false,
      error: "Check your courses, then tick the box to confirm them.",
      fieldErrors: { confirm: "Confirm that your course list is correct." },
    };
  const mode = form.get("mode") ?? "merge";
  if (!MODES.includes(mode as MergeMode))
    return { ok: false, error: "Choose how to add these courses." };
  const state = await readState();
  if (!state.profile) return { ok: false, error: "Set up your profile first." };
  const courses = applyMerge(
    state.profile.courses,
    parsed.data.courses ?? [],
    mode as MergeMode,
  );
  if (courses.length > MAX_COURSES)
    return {
      ok: false,
      error: `That would put ${courses.length} courses on your record; it can hold up to ${MAX_COURSES}. Choose “Replace my whole list”, or remove some courses first.`,
    };
  try {
    await writeState({
      ...state,
      profile: {
        ...state.profile,
        courses,
        recordConfirmed: true,
        // Sample courses merged with an upload are still partly sample data: keep the tag.
        origin:
          mode === "merge" && state.profile.origin === "sample"
            ? "sample"
            : "transcript",
      },
    });
  } catch (err) {
    if (err instanceof StateTooLargeError)
      return { ok: false, error: err.message };
    console.error("Saving the uploaded courses failed.");
    return { ok: false, error: "Your courses couldn't be saved. Try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: undefined };
}
