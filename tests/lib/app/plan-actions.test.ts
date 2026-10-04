import { beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import { EMPTY_STATE, type AppState } from "@/lib/app/types";

// My plan's settings action with the cookie store and Next's cache mocked.
let stored: AppState = EMPTY_STATE;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app/store", () => ({
  readState: async () => stored,
  writeState: async (s: AppState) => {
    stored = s;
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

const { updatePlanSettings } = await import("@/app/app/(shell)/plan/actions");

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

beforeEach(() => {
  stored = { version: 1, profile: SAMPLE_PROFILE, draft: null };
  revalidatePath.mockClear();
});

describe("updatePlanSettings", () => {
  test("changes only the plan term and load, then refreshes the app", async () => {
    const result = await updatePlanSettings(
      null,
      form([
        ["planTerm", "2027-fall"],
        ["courseLoad", "5"],
      ]),
    );
    expect(result).toEqual({ ok: true, data: undefined });
    expect(stored.profile).toEqual({
      ...SAMPLE_PROFILE,
      planTerm: "2027-fall",
      courseLoad: 5,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
  });

  test("a summer choice is saved as the summer answer", async () => {
    const result = await updatePlanSettings(
      null,
      form([
        ["planTerm", "2027-spring"],
        ["courseLoad", "4"],
        ["summer", "some"],
      ]),
    );
    expect(result).toEqual({ ok: true, data: undefined });
    expect(stored.profile?.surveyAnswers).toEqual({ summer: "some" });
  });

  test("an unknown summer choice is refused", async () => {
    const result = await updatePlanSettings(
      null,
      form([
        ["planTerm", "2027-spring"],
        ["courseLoad", "4"],
        ["summer", "always"],
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { summer: "Pick a summer option." },
    });
    expect(stored.profile).toEqual(SAMPLE_PROFILE);
  });

  test("invalid input is refused with field errors", async () => {
    const result = await updatePlanSettings(
      null,
      form([
        ["planTerm", "soon"],
        ["courseLoad", "12"],
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        planTerm: "Pick a term.",
        courseLoad: "Pick a course load.",
      },
    });
    expect(stored.profile).toEqual(SAMPLE_PROFILE);
  });

  test("no profile yet", async () => {
    stored = EMPTY_STATE;
    const result = await updatePlanSettings(
      null,
      form([
        ["planTerm", "2027-fall"],
        ["courseLoad", "4"],
      ]),
    );
    expect(result).toEqual({ ok: false, error: "Set up your profile first." });
  });
});
