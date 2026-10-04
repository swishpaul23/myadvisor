import { z } from "zod";
import {
  ElevenLabsError,
  readElevenLabsApiKey,
  transcribeClip,
} from "@/lib/ai/elevenlabs";
import type { ApiError, ApiErrorCode, TranscribeReply } from "@/lib/app/types";
import { MAX_CLIP_BYTES, spokenTranscript } from "@/lib/app/voice";
import { UnauthorizedError, requireUser } from "@/lib/auth/require-user";

// POST /api/advisor/transcribe (multipart, field "audio"): turns one push-to-talk clip into
// text with ElevenLabs Scribe. The clip lives in memory for this request only: it is never
// written to disk, stored, or logged, and neither is the transcript.

const TOO_LARGE = "too_large";
const clipSchema = z
  .instanceof(Blob, { message: "Record a question first." })
  .refine((f) => f.size > 0, "That recording is empty.")
  .refine((f) => f.size <= MAX_CLIP_BYTES, TOO_LARGE)
  .refine(
    (f) => f.type === "" || /^(audio|video)\//.test(f.type),
    "That recording isn't audio.",
  );

function fail(status: number, error: ApiErrorCode, message: string) {
  return Response.json({ ok: false, error, message } satisfies ApiError, {
    status,
  });
}

const tooLarge = () =>
  fail(
    413,
    "file_too_large",
    "That recording is too long. Keep questions under a minute.",
  );

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return fail(401, "unauthorized", "Sign in to use the advisor.");
    throw err;
  }
  if (!readElevenLabsApiKey())
    return fail(
      503,
      "voice_unavailable",
      "Voice isn't available right now. Type your question instead.",
    );

  // Reject oversized uploads before reading them (multipart adds a little overhead).
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_CLIP_BYTES + 64 * 1024) return tooLarge();

  const form = await request.formData().catch(() => null);
  const parsed = clipSchema.safeParse(form?.get("audio"));
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Record a question first.";
    return message === TOO_LARGE
      ? tooLarge()
      : fail(400, "invalid_input", message);
  }

  let raw: string;
  try {
    raw = await transcribeClip(parsed.data);
  } catch (err) {
    if (!(err instanceof ElevenLabsError)) throw err;
    console.error(
      `Advisor voice: speech-to-text failed (status ${err.status}).`,
    );
    return fail(
      502,
      "voice_error",
      "Voice isn't working right now. Type your question instead.",
    );
  }
  const text = spokenTranscript(raw);
  if (!text)
    return fail(
      422,
      "no_speech",
      "We didn't catch any speech. Try again a little closer to the mic.",
    );
  return Response.json({ ok: true, text } satisfies TranscribeReply);
}
