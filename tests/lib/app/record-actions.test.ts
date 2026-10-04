import { beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import { EMPTY_STATE, type AppState, type RecordCourse } from "@/lib/app/types";

// Academic record's save action with the cookie store and Next's cache mocked.
let stored: AppState = EMPTY_STATE;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app/store", () => ({
  readState: async () => stored,
  writeState: async (s: AppState) => {
    stored = s;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { updateRecord } = await import("@/app/app/(shell)/record/actions");

const course: RecordCourse = {
  code: "BUS 201",
  term: "2024-fall",
  status: "completed",
  grade: "A",
  institution: "SFU",
  units: null,
};
const form = (courses: unknown, confirm = true) => {
  const f = new FormData();
  f.append("courses", JSON.stringify(courses));
  if (confirm) f.append("confirm", "on");
  return f;
};

beforeEach(() => {
  stored = { version: 1, profile: SAMPLE_PROFILE, draft: null };
});

describe("updateRecord", () => {
  test("saves the edited list, re-confirmed; an edited sample is no longer sample data", async () => {
    expect(await updateRecord(null, form([course]))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(stored.profile).toMatchObject({
      courses: [course],
      recordConfirmed: true,
      origin: "manual",
    });
  });

  test("a transcript record stays marked as from the transcript", async () => {
    stored = {
      version: 1,
      profile: { ...SAMPLE_PROFILE, origin: "transcript" },
      draft: null,
    };
    await updateRecord(null, form([course]));
    expect(stored.profile?.origin).toBe("transcript");
  });

  test("needs the Reviewed and confirmed tick", async () => {
    expect(await updateRecord(null, form([course], false))).toMatchObject({
      ok: false,
      fieldErrors: { confirm: expect.any(String) },
    });
    expect(stored.profile).toEqual(SAMPLE_PROFILE);
  });

  test("row errors come back per field; nothing saved", async () => {
    const result = await updateRecord(null, form([{ ...course, grade: null }]));
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        "courses.0.grade": "Add the grade for a completed course.",
      },
    });
    expect(stored.profile).toEqual(SAMPLE_PROFILE);
  });
});
