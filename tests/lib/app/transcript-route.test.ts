import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Extraction } from "@/lib/app/transcript";

// POST /api/transcript with auth, Gemini and the course data mocked. Checks every error
// path returns a typed error, and that Gemini is only called for a valid PDF.
const state = { signedIn: true, hasKey: true };
const gemini = vi.fn<(args: { fallback: Extraction }) => Promise<Extraction>>();

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
  generateGeminiObjectFromFile: (args: { fallback: Extraction }) =>
    gemini(args),
}));
vi.mock("@/lib/data/source", () => ({
  loadReferenceData: async () => ({ courses: [{ code: "BUS 201" }] }),
}));

const { POST } = await import("@/app/api/transcript/route");

const PDF = new TextEncoder().encode("%PDF-1.7\n fake transcript");
const post = (file?: Blob, name = "transcript.pdf") => {
  const body = new FormData();
  if (file) body.append("file", file, name);
  return POST(
    new Request("http://localhost/api/transcript", { method: "POST", body }),
  );
};
const pdf = () => new Blob([PDF], { type: "application/pdf" });

beforeEach(() => {
  state.signedIn = true;
  state.hasKey = true;
  gemini.mockReset();
});

describe("POST /api/transcript", () => {
  test("signed out -> 401", async () => {
    state.signedIn = false;
    const res = await post(pdf());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "unauthorized",
    });
  });

  test("no Gemini key -> 503 'Upload unavailable, enter courses manually.'", async () => {
    state.hasKey = false;
    const res = await post(pdf());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      error: "upload_unavailable",
      message: "Upload unavailable, enter courses manually.",
    });
    expect(gemini).not.toHaveBeenCalled();
  });

  test("no file, empty file -> 400", async () => {
    expect((await post()).status).toBe(400);
    expect((await post(new Blob([]))).status).toBe(400);
    expect(gemini).not.toHaveBeenCalled();
  });

  test("over 10 MB -> 413", async () => {
    const big = new Blob([PDF, new Uint8Array(10 * 1024 * 1024)]);
    const res = await post(big);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "file_too_large" });
  });

  test("not a PDF (by content, not name) -> 415", async () => {
    const res = await post(
      new Blob(["just text"], { type: "application/pdf" }),
    );
    expect(res.status).toBe(415);
    expect(gemini).not.toHaveBeenCalled();
  });

  test("Gemini can't read it, or finds no courses -> 422", async () => {
    gemini.mockImplementation(async ({ fallback }) => fallback);
    expect((await post(pdf())).status).toBe(422);
    gemini.mockResolvedValue({ courses: [], cgpa: null, standing: null });
    expect((await post(pdf())).status).toBe(422);
  });

  test("success -> normalised rows with flags", async () => {
    gemini.mockResolvedValue({
      courses: [
        {
          code: "bus 201",
          title: null,
          units: 3,
          grade: "B",
          term: "2024-fall",
          status: "completed",
          institution: "SFU",
        },
        {
          code: "CMPT 120",
          title: null,
          units: 3,
          grade: "A",
          term: "2024-fall",
          status: "completed",
          institution: "SFU",
        },
      ],
      cgpa: null,
      standing: null,
    });
    const res = await post(pdf());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.courses[0]).toMatchObject({ code: "BUS 201", grade: "B" });
    expect(Object.keys(body.flags)).toEqual(["1"]);
  });
});
