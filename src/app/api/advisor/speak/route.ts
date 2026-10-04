import { z } from "zod";
import {
  ElevenLabsError,
  readElevenLabsApiKey,
  readElevenLabsVoiceId,
  speechStream,
} from "@/lib/ai/elevenlabs";
import type { ApiError, ApiErrorCode } from "@/lib/app/types";
import { MAX_SPEAK_INPUT, speakableText } from "@/lib/app/voice";
import { UnauthorizedError, requireUser } from "@/lib/auth/require-user";

// POST /api/advisor/speak { text }: reads one advisor answer aloud with ElevenLabs
// text-to-speech and streams the MP3 back. Citation markers and URLs are removed first.
// The text is never stored or logged (answers can mention grades).

const speakSchema = z.object({
  text: z
    .string()
    .min(1, "Nothing to read aloud.")
    .max(MAX_SPEAK_INPUT, "That answer is too long to read aloud."),
});

function fail(status: number, error: ApiErrorCode, message: string) {
  return Response.json({ ok: false, error, message } satisfies ApiError, {
    status,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return fail(401, "unauthorized", "Sign in to use the advisor.");
    throw err;
  }
  if (!readElevenLabsApiKey() || !readElevenLabsVoiceId())
    return fail(
      503,
      "voice_unavailable",
      "Read-aloud isn't available right now. The answer is above.",
    );

  const body: unknown = await request.json().catch(() => null);
  const parsed = speakSchema.safeParse(body);
  if (!parsed.success)
    return fail(
      400,
      "invalid_input",
      parsed.error.issues[0]?.message ?? "Nothing to read aloud.",
    );
  const text = speakableText(parsed.data.text);
  if (!text) return fail(400, "invalid_input", "Nothing to read aloud.");

  try {
    const audio = await speechStream(text);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (!(err instanceof ElevenLabsError)) throw err;
    console.error(
      `Advisor voice: text-to-speech failed (status ${err.status}).`,
    );
    return fail(
      502,
      "voice_error",
      "Read-aloud isn't working right now. The answer is above.",
    );
  }
}
