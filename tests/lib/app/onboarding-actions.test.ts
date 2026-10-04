import { beforeEach, describe, expect, test, vi } from "vitest";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import { EMPTY_STATE, type AppState } from "@/lib/app/types";

// The server actions with the cookie store mocked: what they save and where they send the
// student. redirect() throws in Next; the mock records the target instead.
let stored: AppState = EMPTY_STATE;
const writeState = vi.fn(async (s: AppState) => {
  stored = s;
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app/store", () => ({
  readState: async () => stored,
  writeState: (s: AppState) => writeState(s),
}));
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));

const actions = await import("@/app/app/start/actions");
const { StateTooLargeError } = await import("@/lib/app/state-cookie");

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const redirectOf = async (p: Promise<unknown>) => {
  const err = await p.catch((e: unknown) => e);
  return err instanceof Redirect ? err.to : err;
};

beforeEach(() => {
  stored = EMPTY_STATE;
  writeState.mockClear();
});

describe("onboarding server actions", () => {
  test("a valid step is saved to the draft and moves on", async () => {
    const to = await redirectOf(
      actions.saveStep(
        "program",
        null,
        form([
          ["admissionTerm", "2024-fall"],
          ["concentrations", "Finance"],
        ]),
      ),
    );
    expect(to).toBe("/app/start/next-term");
    expect(stored.draft).toMatchObject({
      step: 1,
      admissionTerm: "2024-fall",
      concentrations: ["Finance"],
    });
  });

  test("an invalid step saves nothing and returns field errors", async () => {
    const result = await actions.saveStep("next-term", null, form([]));
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { planTerm: "Pick a term." },
    });
    expect(writeState).not.toHaveBeenCalled();
  });

  test("a state too large to save is a plain-language error", async () => {
    writeState.mockRejectedValueOnce(new StateTooLargeError());
    const result = await actions.saveStep(
      "program",
      null,
      form([
        ["admissionTerm", "2024-fall"],
        ["concentrations", "Finance"],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      error: new StateTooLargeError().message,
    });
  });

  test("survey answers go to the next question, then to review", async () => {
    expect(
      await redirectOf(
        actions.saveAnswer(
          null,
          form([
            ["questionId", "finish-by"],
            ["answer", "asap"],
          ]),
        ),
      ),
    ).toBe("/app/start/questions?q=1");
    expect(
      await redirectOf(
        actions.saveAnswer(
          null,
          form([
            ["questionId", "next-term-focus"],
            ["answer", "skip"],
          ]),
        ),
      ),
    ).toBe("/app/start/review");
    expect(stored.draft?.surveyAnswers).toEqual({
      "finish-by": "asap",
      "next-term-focus": "skip",
    });
  });

  test("finishing needs the confirmation tick", async () => {
    const result = await actions.finishOnboarding(null, form([]));
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { confirm: expect.any(String) },
    });
  });

  test("the sample student is saved as the profile and opens the app", async () => {
    stored = { version: 1, profile: null, draft: { step: 2 } };
    expect(await redirectOf(actions.loadSampleStudent())).toBe("/app");
    expect(stored).toEqual({
      version: 1,
      profile: SAMPLE_PROFILE,
      draft: null,
    });
  });

  test("a reviewed transcript needs the tick, then continues onboarding", async () => {
    const courses = JSON.stringify([
      {
        code: "BUS 201",
        term: "2024-fall",
        status: "completed",
        grade: "B",
        institution: "SFU",
        units: null,
      },
    ]);
    const unticked = await actions.saveTranscriptReview(
      null,
      form([["courses", courses]]),
    );
    expect(unticked).toMatchObject({
      ok: false,
      fieldErrors: { confirm: expect.any(String) },
    });
    expect(writeState).not.toHaveBeenCalled();

    const to = await redirectOf(
      actions.saveTranscriptReview(
        null,
        form([
          ["courses", courses],
          ["confirm", "on"],
        ]),
      ),
    );
    expect(to).toBe("/app/start/program"); // program not done yet
    expect(stored.draft).toMatchObject({
      origin: "transcript",
      recordConfirmed: true,
      step: 3,
    });
  });
});
