import "server-only";

/**
 * Server-only ElevenLabs access: speech-to-text (Scribe) and text-to-speech, over plain
 * fetch. Keys are read per request, so `next build` does not need them.
 *
 * Audio and text are never logged: errors carry the HTTP status only, never a body.
 */

const API = "https://api.elevenlabs.io/v1";
const STT_MODEL = "scribe_v2";
const TTS_MODEL = "eleven_flash_v2_5";
const STT_TIMEOUT_MS = 30_000;
const TTS_TIMEOUT_MS = 30_000;

export function readElevenLabsApiKey(): string | undefined {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  return key ? key : undefined;
}

export function readElevenLabsVoiceId(): string | undefined {
  const id = process.env.ELEVENLABS_VOICE_ID?.trim();
  return id ? id : undefined;
}

/** What the Advisor page may show: the mic needs the key, the speaker also needs a voice. */
export function voiceAvailability(): { listen: boolean; speak: boolean } {
  const listen = Boolean(readElevenLabsApiKey());
  return { listen, speak: listen && Boolean(readElevenLabsVoiceId()) };
}

/** An ElevenLabs call failed. `status` is the HTTP status, or 0 for a network error or timeout. */
export class ElevenLabsError extends Error {
  constructor(readonly status: number) {
    super(`ElevenLabs request failed (status ${status}).`);
    this.name = "ElevenLabsError";
  }
}

async function call(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const key = readElevenLabsApiKey();
  if (!key) throw new ElevenLabsError(0);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...init.headers, "xi-api-key": key },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new ElevenLabsError(0);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new ElevenLabsError(res.status);
  }
  return res;
}

/** Transcribes one clip with Scribe. Returns the raw text (possibly empty). */
export async function transcribeClip(clip: Blob): Promise<string> {
  const form = new FormData();
  form.set("model_id", STT_MODEL);
  form.set("tag_audio_events", "false");
  form.set("file", clip, "clip");
  const res = await call(
    "/speech-to-text",
    { method: "POST", body: form },
    STT_TIMEOUT_MS,
  );
  const json: unknown = await res.json().catch(() => null);
  if (!json || typeof json !== "object") throw new ElevenLabsError(502);
  const text = (json as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

/** Starts text-to-speech for `text` and returns the MP3 stream. */
export async function speechStream(
  text: string,
): Promise<ReadableStream<Uint8Array>> {
  const voiceId = readElevenLabsVoiceId();
  if (!voiceId) throw new ElevenLabsError(0);
  const res = await call(
    `/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: TTS_MODEL }),
    },
    TTS_TIMEOUT_MS,
  );
  if (!res.body) throw new ElevenLabsError(502);
  return res.body;
}
