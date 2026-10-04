"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseStep } from "@/lib/app/onboarding";
import { planBasis, toSavedTerms, type BoardTerm } from "@/lib/app/plan-board";
import {
  boardItemsFor,
  checkBoard,
  planFor,
  type BoardCheck,
} from "@/lib/app/plan-check";
import { StateTooLargeError } from "@/lib/app/state-cookie";
import { readState, writeState } from "@/lib/app/store";
import {
  MAX_PLAN_TERM_ITEMS,
  MAX_PLAN_TERMS,
  savedPlanSchema,
  termSchema,
  type ActionResult,
} from "@/lib/app/types";
import { loadReferenceData } from "@/lib/data/source";

/** Summer answers the plan settings can save (the intake question's options). */
const SUMMER = ["full", "some", "no", "unsure"];

/**
 * My plan: change the start term, the course load, summer terms and co-op. The plan is recomputed
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

// ---------- The semester-card board ----------

const boardSchema = z.object({
  terms: z
    .array(
      z.object({
        termId: termSchema,
        kind: z.enum(["study", "coop"]),
        itemIds: z
          .array(savedPlanSchema.shape.terms.element.shape.items.element)
          .max(MAX_PLAN_TERM_ITEMS),
      }),
    )
    .min(1)
    .max(MAX_PLAN_TERMS),
});

const UNREADABLE = "Your plan couldn't be read. Reload and try again.";
const PLAN_TOO_LARGE =
  "Your plan is too large to save on this device. Reset it and try again, or remove a few older transfer courses from your record.";

function parseBoard(input: unknown): BoardTerm[] | null {
  const parsed = boardSchema.safeParse(input);
  return parsed.success ? parsed.data.terms : null;
}

/** Runs the plan validator on a rearranged board. Nothing is saved. */
export async function checkPlan(
  input: unknown,
): Promise<ActionResult<BoardCheck>> {
  const terms = parseBoard(input);
  if (!terms) return { ok: false, error: UNREADABLE };
  const { profile } = await readState();
  if (!profile) return { ok: false, error: "Set up your profile first." };
  try {
    const data = await loadReferenceData();
    const items = boardItemsFor(
      planFor(profile, data).plan,
      data,
      terms.flatMap((t) => t.itemIds),
    );
    return { ok: true, data: checkBoard(profile, terms, items, data) };
  } catch {
    console.error("Checking the plan failed.");
    return { ok: false, error: "Your plan couldn't be checked. Try again." };
  }
}

/**
 * Saves the edited board: course codes per term only, with the record's basis so a later
 * record change marks it out of date. Same encrypted cookies as the profile.
 */
export async function savePlan(input: unknown): Promise<ActionResult> {
  const terms = parseBoard(input);
  if (!terms) return { ok: false, error: UNREADABLE };
  const state = await readState();
  if (!state.profile) return { ok: false, error: "Set up your profile first." };
  try {
    await writeState({
      ...state,
      plan: { basis: planBasis(state.profile), terms: toSavedTerms(terms) },
    });
  } catch (err) {
    if (err instanceof StateTooLargeError)
      return { ok: false, error: PLAN_TOO_LARGE };
    console.error("Saving the plan failed.");
    return { ok: false, error: "Your plan couldn't be saved. Try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: undefined };
}

/** "Regenerate from my record": drops the saved plan; My plan shows the generated one. */
export async function discardSavedPlan(): Promise<ActionResult> {
  const state = await readState();
  try {
    await writeState({ ...state, plan: null });
  } catch {
    console.error("Discarding the saved plan failed.");
    return { ok: false, error: "Your plan couldn't be reset. Try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: undefined };
}
