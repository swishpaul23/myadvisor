import { beforeEach, describe, expect, test, vi } from "vitest";

// POST /api/advisor with auth, Gemini, the degree view and calendar search mocked. The
// degree view is a minimal stand-in: the prompt itself is tested in advisor.test.ts.
const state = { signedIn: true, hasKey: true, hasProfile: true };
const gemini =
  vi.fn<(a: { prompt: string; fallback: string }) => Promise<string>>();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    requireUser: async () => {
      if (!state.signedIn) throw new UnauthorizedError();
      return { id: "sub", email: "s@example.com", name: null };
    },
  };
});
vi.mock("@/lib/ai/google", () => ({
  readGoogleGenerativeAiApiKey: () => (state.hasKey ? "key" : undefined),
  generateGeminiText: (a: { prompt: string; fallback: string }) => gemini(a),
}));
const BBA =
  "https://www.sfu.ca/students/calendar/2026/fall/programs/business/major/bachelor-of-business-administration.html";
vi.mock("@/lib/app/degree", async () => {
  const { SAMPLE_PROFILE } = await import("@/lib/app/sample");
  return {
    getDegreeView: async () =>
      state.hasProfile
        ? {
            profile: SAMPLE_PROFILE,
            units: { completed: 61, inProgress: 13, required: 120 },
            checklist: [],
            gaps: [
              {
                reqId: "finance-bus313",
                label: "BUS 313",
                courses: ["BUS 313"],
                detail:
                  "Required for the Finance concentration. Not on your record yet.",
                source: {
                  title: "SFU Calendar · BBA program requirements",
                  url: BBA,
                },
              },
            ],
            plan: {
              termId: "2027-spring",
              courses: [],
              units: null,
              claims: [],
            },
          }
        : null,
  };
});
vi.mock("@/lib/data/source", () => ({ searchCalendar: async () => [] }));

const { POST } = await import("@/app/api/advisor/route");
const ask = (body: unknown) =>
  POST(
    new Request("http://localhost/api/advisor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  Object.assign(state, { signedIn: true, hasKey: true, hasProfile: true });
  gemini.mockReset();
});

describe("POST /api/advisor", () => {
  test("signed out -> 401", async () => {
    state.signedIn = false;
    expect((await ask({ message: "hi" })).status).toBe(401);
  });

  test("no Gemini key -> 503, model not called", async () => {
    state.hasKey = false;
    const res = await ask({ message: "hi" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "advisor_unavailable",
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  test("invalid body -> 400 with a plain message", async () => {
    expect((await ask("not json")).status).toBe(400);
    const res = await ask({ message: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "invalid_input",
      message: "Type a question.",
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  test("no profile yet -> 400", async () => {
    state.hasProfile = false;
    expect((await ask({ message: "hi" })).status).toBe(400);
  });

  test("model fails -> 503, plain message", async () => {
    gemini.mockImplementation(async ({ fallback }) => fallback);
    const res = await ask({ message: "Do I need BUS 313?" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "advisor_unavailable" });
  });

  test("answer with only the cited, real sources", async () => {
    gemini.mockResolvedValue(
      "Yes, BUS 313 is required for Finance [1]. Also see [9].",
    );
    const res = await ask({ message: "Do I need BUS 313?" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      answer: "Yes, BUS 313 is required for Finance [1]. Also see.",
      sources: [{ title: "SFU Calendar · BBA program requirements", url: BBA }],
    });
    expect(gemini.mock.calls[0]![0].prompt).toContain(
      "STUDENT'S QUESTION: Do I need BUS 313?",
    );
  });

  test("the student's message is never logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    gemini.mockImplementation(async ({ fallback }) => fallback);
    await ask({ message: "My grade in BUS 207 was B+" });
    for (const call of spy.mock.calls)
      expect(JSON.stringify(call)).not.toContain("BUS 207");
    spy.mockRestore();
  });
});
