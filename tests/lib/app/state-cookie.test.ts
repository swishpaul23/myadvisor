import { describe, expect, test } from "vitest";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import {
  MAX_CHUNKS,
  openState,
  sealState,
  StateTooLargeError,
} from "@/lib/app/state-cookie";
import {
  EMPTY_STATE,
  MAX_COURSES,
  type AppState,
  type RecordCourse,
} from "@/lib/app/types";

const SECRET = "test-only-secret-0123456789abcdef0123456789abcdef";
const withProfile: AppState = {
  version: 1,
  profile: SAMPLE_PROFILE,
  draft: null,
};

describe("sealState / openState", () => {
  test("round trip for the same user", async () => {
    const chunks = await sealState(withProfile, "google-sub-1", SECRET);
    expect(await openState(chunks, "google-sub-1", SECRET)).toEqual(
      withProfile,
    );
  });

  test("a cookie written for another user reads as empty", async () => {
    const chunks = await sealState(withProfile, "google-sub-1", SECRET);
    expect(await openState(chunks, "google-sub-2", SECRET)).toEqual(
      EMPTY_STATE,
    );
  });

  test("tampered, truncated, wrong-secret or missing cookies read as empty", async () => {
    const chunks = await sealState(withProfile, "u", SECRET);
    const tampered = [...chunks];
    tampered[0] = `${tampered[0]!.slice(0, -4)}AAAA`;
    expect(await openState(tampered, "u", SECRET)).toEqual(EMPTY_STATE);
    expect(await openState([chunks[0]!.slice(0, 50)], "u", SECRET)).toEqual(
      EMPTY_STATE,
    );
    expect(await openState(chunks, "u", `${SECRET}x`)).toEqual(EMPTY_STATE);
    expect(await openState([undefined, undefined], "u", SECRET)).toEqual(
      EMPTY_STATE,
    );
  });

  test("a full record (MAX_COURSES courses) fits in the cookie budget", async () => {
    const course: RecordCourse = {
      code: "BUS 217W",
      term: "2025-spring",
      status: "completed",
      grade: "A-",
      institution: "transfer",
      units: 3,
    };
    const state: AppState = {
      version: 1,
      profile: {
        ...SAMPLE_PROFILE,
        concentrations: [
          "Innovation and Entrepreneurship",
          "Management Information Systems",
        ],
        courses: Array.from({ length: MAX_COURSES }, () => course),
        surveyAnswers: {
          "finish-by": "lighter",
          summer: "unsure",
          "next-term-focus": "balance",
        },
      },
      // A draft at the same time (editing a copy of the record).
      draft: { step: 3, courses: Array.from({ length: 20 }, () => course) },
    };
    const chunks = await sealState(state, "google-sub-with-21-digits", SECRET);
    expect(chunks.length).toBeLessThanOrEqual(MAX_CHUNKS);
  });

  test("state too large for the cookies throws StateTooLargeError", async () => {
    const huge: AppState = {
      ...withProfile,
      profile: {
        ...SAMPLE_PROFILE,
        surveyAnswers: Object.fromEntries(
          Array.from({ length: 2000 }, (_, i) => [`q${i}`, "an answer"]),
        ),
      },
    };
    await expect(sealState(huge, "u", SECRET)).rejects.toBeInstanceOf(
      StateTooLargeError,
    );
  });

  test("invalid state is refused before it is written", async () => {
    const bad = {
      ...withProfile,
      profile: { ...SAMPLE_PROFILE, planTerm: "next term" },
    };
    await expect(sealState(bad as AppState, "u", SECRET)).rejects.toThrow();
  });
});
