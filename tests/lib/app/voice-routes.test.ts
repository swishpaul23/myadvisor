import { beforeEach, describe, expect, test, vi } from "vitest";

// POST /api/advisor/transcribe and /api/advisor/speak with auth and ElevenLabs mocked.
// The text cleaning itself is tested in voice.test.ts.
const state = { signedIn: true, hasKey: true, hasVoice: true };
const transcribe = vi.fn<(clip: Blob) => Promise<string>>();
const speak = vi.fn<(text: string) => Promise<ReadableStream<Uint8Array>>>();

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
vi.mock("@/lib/ai/elevenlabs", () => {
  class ElevenLabsError extends Error {
    constructor(readonly status: number) {
      super(`ElevenLabs request failed (status ${status}).`);
    }
  }
  return {
    ElevenLabsError,
    readElevenLabsApiKey: () => (state.hasKey ? "key" : undefined),
    readElevenLabsVoiceId: () => (state.hasVoice ? "voice" : undefined),
    transcribeClip: (clip: Blob) => transcribe(clip),
    speechStream: (text: string) => speak(text),
  };
});

const { ElevenLabsError } = await import("@/lib/ai/elevenlabs");
const { POST: transcribePost } =
  await import("@/app/api/advisor/transcribe/route");
const { POST: speakPost } = await import("@/app/api/advisor/speak/route");
const { MAX_CLIP_BYTES } = await import("@/lib/app/voice");

const clip = (bytes = 2048, type = "audio/webm") =>
  new Blob([new Uint8Array(bytes)], { type });
const upload = (audio?: Blob) => {
  const form = new FormData();
  if (audio) form.set("audio", audio, "clip");
  return transcribePost(
    new Request("http://localhost/api/advisor/transcribe", {
      method: "POST",
      body: form,
    }),
  );
};
const say = (body: unknown) =>
  speakPost(
    new Request("http://localhost/api/advisor/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const audioStream = () =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([0xff, 0xfb]));
      c.close();
    },
  });

beforeEach(() => {
  Object.assign(state, { signedIn: true, hasKey: true, hasVoice: true });
  transcribe.mockReset();
  speak.mockReset();
});

describe("POST /api/advisor/transcribe", () => {
  test("signed out -> 401, ElevenLabs not called", async () => {
    state.signedIn = false;
    expect((await upload(clip())).status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  test("no ElevenLabs key -> 503 voice_unavailable", async () => {
    state.hasKey = false;
    const res = await upload(clip());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "voice_unavailable" });
  });

  test("missing, empty or non-audio clip -> 400", async () => {
    expect((await upload()).status).toBe(400);
    expect((await upload(clip(0))).status).toBe(400);
    expect((await upload(clip(10, "application/pdf"))).status).toBe(400);
    expect(transcribe).not.toHaveBeenCalled();
  });

  test("clip over 4 MB -> 413", async () => {
    const res = await upload(clip(MAX_CLIP_BYTES + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "file_too_large" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  test("returns the cleaned transcript", async () => {
    transcribe.mockResolvedValue(" (cough) Do I still need BUS 393? ");
    const res = await upload(clip());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      text: "Do I still need BUS 393?",
    });
  });

  test("no speech -> 422 no_speech", async () => {
    transcribe.mockResolvedValue("");
    const res = await upload(clip());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "no_speech" });
  });

  test("ElevenLabs error -> 502 with a plain message, nothing private logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    transcribe.mockRejectedValue(new ElevenLabsError(500));
    const res = await upload(clip());
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("voice_error");
    expect(body.message).not.toMatch(/status|stack|Error/);
    for (const call of spy.mock.calls)
      expect(JSON.stringify(call)).not.toMatch(/BUS|audio|webm/i);
    spy.mockRestore();
  });
});

describe("POST /api/advisor/speak", () => {
  test("signed out -> 401", async () => {
    state.signedIn = false;
    expect((await say({ text: "hi" })).status).toBe(401);
  });

  test("no key or no voice ID -> 503 voice_unavailable", async () => {
    state.hasVoice = false;
    expect((await say({ text: "hi" })).status).toBe(503);
    state.hasVoice = true;
    state.hasKey = false;
    expect((await say({ text: "hi" })).status).toBe(503);
    expect(speak).not.toHaveBeenCalled();
  });

  test("invalid body or nothing speakable -> 400", async () => {
    expect((await say("not json")).status).toBe(400);
    expect((await say({ text: "" })).status).toBe(400);
    expect((await say({ text: "[1] https://www.sfu.ca" })).status).toBe(400);
    expect(speak).not.toHaveBeenCalled();
  });

  test("streams MP3 for the answer without citations or URLs", async () => {
    speak.mockResolvedValue(audioStream());
    const res = await say({
      text: "Yes, BUS 313 is required [1]. See https://www.sfu.ca/x.html.",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xfb]),
    );
    expect(speak).toHaveBeenCalledWith("Yes, BUS 313 is required. See.");
  });

  test("ElevenLabs error -> 502 with a plain message, the answer not logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    speak.mockRejectedValue(new ElevenLabsError(401));
    const res = await say({ text: "Your BUS 207 grade was B+." });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "voice_error" });
    for (const call of spy.mock.calls)
      expect(JSON.stringify(call)).not.toContain("BUS 207");
    spy.mockRestore();
  });
});
