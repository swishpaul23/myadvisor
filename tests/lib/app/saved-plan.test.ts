import { beforeEach, describe, expect, test, vi } from "vitest";
import { planBasis } from "@/lib/app/plan-board";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import {
  openState,
  sealState,
  StateTooLargeError,
} from "@/lib/app/state-cookie";
import {
  EMPTY_STATE,
  type AppState,
  type RecordCourse,
  type SavedPlan,
  type StudentProfile,
} from "@/lib/app/types";

// The student's edited plan: saved as course codes per term (no grades, no titles) in the
// same encrypted cookies as the profile. Expected results are written by hand.

const SECRET = "test-secret-at-least-32-characters-long";
const SUB = "google-sub-1";

let stored: AppState = EMPTY_STATE;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app/store", () => ({
  readState: async () => stored,
  // Seal for real, so the cookie size limit applies exactly as in the app.
  writeState: async (s: AppState) => {
    await sealState(s, SUB, SECRET);
    stored = s;
  },
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

const { savePlan, discardSavedPlan } =
  await import("@/app/app/(shell)/plan/actions");

const PLAN: SavedPlan = {
  basis: "x1",
  terms: [
    { id: "2027-spring", kind: "study", items: ["BUS 373", "BUS 410"] },
    { id: "2027-summer", kind: "coop", items: [] },
    { id: "2027-fall", kind: "study", items: ["BUS 315", "@0", "@1"] },
  ],
};

/** A full 60-course record with long codes: the largest profile the schema allows. */
const bigProfile: StudentProfile = {
  ...SAMPLE_PROFILE,
  courses: Array.from({ length: 60 }, (_, i): RecordCourse => ({
    code: `ABCDE ${100 + i}W`,
    term: "2024-summer",
    status: "completed",
    grade: "B+",
    institution: "transfer",
    units: 3.5,
  })),
};
/** 24 terms of 20 long course codes: within the schema, too big for the cookies. */
const hugePlan: SavedPlan = {
  basis: "x1",
  terms: Array.from({ length: 24 }, (_, t) => ({
    id: `${2027 + Math.floor(t / 3)}-${["spring", "summer", "fall"][t % 3]}`,
    kind: "study" as const,
    items: Array.from(
      { length: 20 },
      (_, i) => `ABCDE ${300 + t * 4 + (i % 4)}W`,
    ),
  })),
};

beforeEach(() => {
  stored = { version: 1, profile: SAMPLE_PROFILE, draft: null };
  revalidatePath.mockClear();
});

describe("saved plan in the cookie", () => {
  test("round-trips: codes per term, co-op terms and electives kept", async () => {
    const state: AppState = {
      version: 1,
      profile: SAMPLE_PROFILE,
      draft: null,
      plan: PLAN,
    };
    const chunks = await sealState(state, SUB, SECRET);
    expect(await openState(chunks, SUB, SECRET)).toEqual(state);
  });

  test("a cookie saved before plans existed still opens, with no plan", async () => {
    const chunks = await sealState(
      { version: 1, profile: SAMPLE_PROFILE, draft: null },
      SUB,
      SECRET,
    );
    const opened = await openState(chunks, SUB, SECRET);
    expect(opened.profile).toEqual(SAMPLE_PROFILE);
    expect(opened.plan ?? null).toBeNull();
  });

  test("the largest record with a realistic plan fits", async () => {
    await expect(
      sealState(
        { version: 1, profile: bigProfile, draft: null, plan: PLAN },
        SUB,
        SECRET,
      ),
    ).resolves.toBeInstanceOf(Array);
  });

  test("a plan that doesn't fit is StateTooLargeError, not a broken cookie", async () => {
    await expect(
      sealState(
        { version: 1, profile: bigProfile, draft: null, plan: hugePlan },
        SUB,
        SECRET,
      ),
    ).rejects.toBeInstanceOf(StateTooLargeError);
  });
});

describe("planBasis (out-of-date check)", () => {
  test("the same record and settings give the same basis", () => {
    expect(planBasis({ ...SAMPLE_PROFILE })).toBe(planBasis(SAMPLE_PROFILE));
  });

  test("adding, removing or regrading a course changes it", () => {
    const base = planBasis(SAMPLE_PROFILE);
    const added = {
      ...SAMPLE_PROFILE,
      courses: [
        ...SAMPLE_PROFILE.courses,
        {
          code: "PSYC 100",
          term: "2026-fall",
          status: "in_progress",
          grade: null,
          institution: "SFU",
          units: null,
        } as RecordCourse,
      ],
    };
    const removed = {
      ...SAMPLE_PROFILE,
      courses: SAMPLE_PROFILE.courses.slice(1),
    };
    const regraded = {
      ...SAMPLE_PROFILE,
      courses: SAMPLE_PROFILE.courses.map((c, i) =>
        i === 0 ? { ...c, grade: "A" as const } : c,
      ),
    };
    expect(planBasis(added)).not.toBe(base);
    expect(planBasis(removed)).not.toBe(base);
    expect(planBasis(regraded)).not.toBe(base);
  });

  test("the course order on the record doesn't matter", () => {
    expect(
      planBasis({
        ...SAMPLE_PROFILE,
        courses: [...SAMPLE_PROFILE.courses].reverse(),
      }),
    ).toBe(planBasis(SAMPLE_PROFILE));
  });

  test("plan settings change it; other survey answers don't", () => {
    const base = planBasis(SAMPLE_PROFILE);
    expect(planBasis({ ...SAMPLE_PROFILE, planTerm: "2027-fall" })).not.toBe(
      base,
    );
    expect(planBasis({ ...SAMPLE_PROFILE, courseLoad: 5 })).not.toBe(base);
    expect(
      planBasis({ ...SAMPLE_PROFILE, surveyAnswers: { summer: "full" } }),
    ).not.toBe(base);
    expect(
      planBasis({
        ...SAMPLE_PROFILE,
        surveyAnswers: { "finish-by": "lighter" },
      }),
    ).toBe(base);
  });
});

describe("savePlan action", () => {
  test("saves only codes per term with the record's basis, then refreshes", async () => {
    const result = await savePlan({
      terms: [
        {
          termId: "2027-spring",
          kind: "study",
          itemIds: ["BUS 373", "BUS 410"],
        },
        { termId: "2027-summer", kind: "coop", itemIds: [] },
        {
          termId: "2027-fall",
          kind: "study",
          itemIds: ["BUS 315", "@0", "@1"],
        },
      ],
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(stored.plan).toEqual({
      ...PLAN,
      basis: planBasis(SAMPLE_PROFILE),
    });
    expect(stored.profile).toEqual(SAMPLE_PROFILE);
    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
  });

  test("an oversized plan gives the plain-language error and saves nothing", async () => {
    stored = { version: 1, profile: bigProfile, draft: null };
    const result = await savePlan({
      terms: hugePlan.terms.map((t) => ({
        termId: t.id,
        kind: t.kind,
        itemIds: t.items,
      })),
    });
    expect(result).toEqual({
      ok: false,
      error:
        "Your plan is too large to save on this device. Reset it and try again, or remove a few older transfer courses from your record.",
    });
    expect(stored.plan ?? null).toBeNull();
  });

  test("bad input is refused with a plain message", async () => {
    expect(
      await savePlan({ terms: [{ termId: "soon", itemIds: [] }] }),
    ).toEqual({
      ok: false,
      error: "Your plan couldn't be read. Reload and try again.",
    });
    expect(await savePlan(null)).toMatchObject({ ok: false });
    expect(stored.plan ?? null).toBeNull();
  });

  test("Regenerate from my record discards the saved plan", async () => {
    stored = { ...stored, plan: PLAN };
    expect(await discardSavedPlan()).toEqual({ ok: true, data: undefined });
    expect(stored.plan).toBeNull();
    expect(stored.profile).toEqual(SAMPLE_PROFILE);
  });
});
