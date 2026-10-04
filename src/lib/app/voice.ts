// Voice for the Advisor: limits shared by the browser and the API routes, and the text
// cleaning both sides rely on. No ElevenLabs access here (see src/lib/ai/elevenlabs.ts).

/** Longest push-to-talk clip. The recorder stops itself at this point. */
export const MAX_CLIP_SECONDS = 60;
/** Largest clip the transcribe route accepts. */
export const MAX_CLIP_BYTES = 4 * 1024 * 1024;
/** Longest text sent to text-to-speech; longer answers are cut at a sentence. */
export const MAX_SPOKEN_CHARS = 2500;
/** Longest raw answer the speak route accepts, before cleaning. */
export const MAX_SPEAK_INPUT = 8000;

/** Shown wherever voice controls are, so students know where their audio goes. */
export const VOICE_NOTICE =
  "Voice is processed by ElevenLabs and not stored by us.";

/**
 * An advisor answer as it should be read aloud: no citation markers ([1], [1, 2]), no URLs,
 * no markdown marks. Markdown links keep their words. Long answers are cut at the last
 * sentence that fits in MAX_SPOKEN_CHARS. The written answer and its sources are unchanged.
 */
export function speakableText(answer: string): string {
  const text = answer
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)\s]*\)/g, "$1")
    .replace(/\s*\((?:https?:\/\/|www\.)[^)\s]*\)/g, "")
    .replace(/\s*\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/g, "")
    .replace(/(?:https?:\/\/|www\.)\S*[^\s.,;:!?]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= MAX_SPOKEN_CHARS) return text;
  const cut = text.slice(0, MAX_SPOKEN_CHARS + 1);
  const end = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf(".\n"),
  );
  return (
    end > 0 ? cut.slice(0, end + 1) : cut.slice(0, MAX_SPOKEN_CHARS)
  ).trim();
}

/** A speech-to-text result as a question: audio-event tags like "(music)" removed. Empty means no speech. */
export function spokenTranscript(text: string | undefined): string {
  return (text ?? "")
    .replace(/\([^()]*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
