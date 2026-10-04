import { beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import {
  EMPTY_STATE,
  MAX_COURSES,
  type AppState,
  type RecordCourse,
} from "@/lib/app/types";

// Academic record: merging an uploaded, reviewed transcript into the course list, with the
// cookie store and Next's cache mocked. Expected results written by hand.
let stored: AppState = EMPTY_STATE;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app/store", () => ({
  readState: async () => stored,
  writeState: async (s: AppState) => {
    stored = s;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { importTranscript } = await import("@/app/app/(shell)/record/actions");

const c = (
  code: string,
  term: string,
  grade: RecordCourse["grade"],
): RecordCourse => ({
  code,
  term,
  status: grade === null ? "in_progress" : "completed",
  grade,
  institution: "SFU",
  units: null,
});
const current = [
  c("BUS 201", "2024-fall", "B"),
  c("ECON 103", "2024-fall", "B+"),
  c("BUS 312", "2026-fall", null),
];
const uploaded = [
  c("BUS 201", "2024-fall", "B"),
  c("BUS 312", "2026-fall", "A-"),
  c("BUS 343", "2026-fall", "B"),
];
const form = (
  courses: unknown,
  { confirm = true, mode }: { confirm?: boolean; mode?: string } = {},
) => {
  const f = new FormData();
  f.append("courses", JSON.stringify(courses));
  if (confirm) f.append("confirm", "on");
  if (mode) f.append("mode", mode);
  return f;
};

beforeEach(() => {
  stored = {
    version: 1,
    profile: { ...SAMPLE_PROFILE, courses: current, origin: "manual" },
    draft: null,
  };
});

describe("importTranscript", () => {
  test("defaults to add/update: new added, changed grade updated, duplicate ignored, nothing deleted", async () => {
    expect(await importTranscript(null, form(uploaded))).toEqual({
      ok: true,
      data: undefined,
    });
    expect(stored.profile).toMatchObject({
      courses: [
        c("BUS 201", "2024-fall", "B"),
        c("ECON 103", "2024-fall", "B+"),
        c("BUS 312", "2026-fall", "A-"),
        c("BUS 343", "2026-fall", "B"),
      ],
      origin: "transcript",
      recordConfirmed: true,
    });
  });

  test("merging into the sample record keeps it marked as sample data", async () => {
    stored = {
      version: 1,
      profile: { ...SAMPLE_PROFILE, courses: current, origin: "sample" },
      draft: null,
    };
    await importTranscript(null, form(uploaded));
    expect(stored.profile?.origin).toBe("sample");
    await importTranscript(null, form(uploaded, { mode: "replace" }));
    expect(stored.profile?.origin).toBe("transcript");
  });

  test("replace deletes courses only when the student chose it", async () => {
    await importTranscript(null, form(uploaded, { mode: "replace" }));
    expect(stored.profile?.courses).toEqual(uploaded);
  });

  test("an unknown mode is refused, not treated as replace", async () => {
    const result = await importTranscript(
      null,
      form(uploaded, { mode: "delete-all" }),
    );
    expect(result).toMatchObject({ ok: false });
    expect(stored.profile?.courses).toEqual(current);
  });

  test("needs the Reviewed and confirmed tick", async () => {
    expect(
      await importTranscript(null, form(uploaded, { confirm: false })),
    ).toEqual({
      ok: false,
      error: "Check your courses, then tick the box to confirm them.",
      fieldErrors: { confirm: "Confirm that your course list is correct." },
    });
    expect(stored.profile?.courses).toEqual(current);
  });

  test("more than 60 courses after the merge gives the plain-language error", async () => {
    stored = {
      version: 1,
      profile: {
        ...SAMPLE_PROFILE,
        courses: Array.from({ length: MAX_COURSES }, (_, i) =>
          c(`ECON ${100 + i}`, "2024-fall", "B"),
        ),
      },
      draft: null,
    };
    const before = stored.profile!.courses;
    expect(
      await importTranscript(null, form([c("BUS 343", "2026-fall", "B")])),
    ).toEqual({
      ok: false,
      error:
        "That would put 61 courses on your record; it can hold up to 60. Choose “Replace my whole list”, or remove some courses first.",
    });
    expect(stored.profile?.courses).toEqual(before);
  });

  test("row errors in the reviewed list come back per field", async () => {
    const result = await importTranscript(
      null,
      form([{ ...c("BUS 343", "2026-fall", "B"), grade: null }]),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { "courses.0.grade": expect.any(String) },
    });
  });
});
