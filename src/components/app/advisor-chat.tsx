"use client";

import { BookOpen } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_HISTORY, MAX_MESSAGE } from "@/lib/app/advisor";
import type { AdvisorReply, Source } from "@/lib/app/types";
import { VOICE_NOTICE } from "@/lib/app/voice";
import { cn } from "@/lib/utils";
import {
  MicButton,
  SpeakerControls,
  useRecorder,
  useSpeaker,
} from "./advisor-voice";
import { FormError } from "./form-parts";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD,
  FOCUS,
  HINT,
  PANEL,
} from "./styles";

type Message =
  | { role: "user"; text: string }
  | { role: "advisor"; text: string; sources: Source[] };

function AdvisorTag() {
  return (
    <span className="rounded-[6px] bg-paper px-2 py-[3px] text-[11px] font-medium">
      Advisor
    </span>
  );
}

/**
 * Chat with the advisor by text, or by voice when ElevenLabs is set up (`voice`). Nothing is
 * stored: the conversation lives in this page.
 */
export function AdvisorChat({
  intro,
  starters,
  available,
  voice,
}: {
  intro: string;
  starters: string[];
  available: boolean;
  /** listen: voice input is configured. speak: answers can be read aloud. */
  voice: { listen: boolean; speak: boolean };
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "advisor", text: intro, sources: [] },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const voiceHelpId = useId();
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const speakerOnRef = useRef(speakerOn);
  const speaker = useSpeaker({ onError: setVoiceError });
  const recorder = useRecorder({
    // A spoken question leaves anything typed in the box alone.
    onText: (text) => void ask(text, { keepDraft: true }),
    onError: setVoiceError,
  });
  const canUseMic = voice.listen && recorder.supported;
  const voiceUnavailableReason = !voice.listen
    ? "Voice isn't configured on this deployment. Type your question instead."
    : !recorder.supported
      ? "Voice recording isn't supported in this browser. Type your question instead."
      : null;
  const voiceBusy = recorder.state !== "idle";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, pending]);

  async function ask(question: string, { keepDraft = false } = {}) {
    const message = question.trim();
    if (!message || pending) return;
    setError(null);
    setVoiceError(null);
    speaker.stop();
    setPending(true);
    // The intro isn't sent; the last few turns give the advisor context.
    const history = messages
      .slice(1)
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((all) => [...all, { role: "user", text: message }]);
    if (!keepDraft) setDraft("");
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const reply = (await res.json()) as AdvisorReply;
      if (reply.ok) {
        setMessages((all) => [
          ...all,
          { role: "advisor", text: reply.answer, sources: reply.sources },
        ]);
        if (voice.speak && speakerOnRef.current)
          void speaker.speak(reply.answer);
      } else setError(reply.message);
    } catch {
      setError(
        "Your question didn't go through. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol
        aria-label="Conversation"
        aria-live="polite"
        className="flex flex-col gap-3"
      >
        {messages.map((m, i) =>
          m.role === "user" ? (
            <li
              key={i}
              className="max-w-[85%] self-end rounded-[14px] bg-ink px-4 py-2.5 text-[14px] leading-[1.5] text-white"
            >
              <span className="sr-only">You: </span>
              {m.text}
            </li>
          ) : (
            <li key={i} className={cn(PANEL, "max-w-[90%] p-4 text-[14px]")}>
              <AdvisorTag />
              <p className="mt-2 leading-[1.55] whitespace-pre-line">
                {m.text}
              </p>
              {m.sources.length > 0 && (
                <ol className="mt-3 flex flex-col gap-1 border-t border-line-soft pt-3">
                  {m.sources.map((s, n) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex items-center gap-2 text-[12px] text-ink-body underline-offset-2 hover:text-ink hover:underline",
                          FOCUS,
                        )}
                      >
                        <BookOpen
                          size={14}
                          aria-hidden="true"
                          className="flex-none"
                        />
                        [{n + 1}] {s.title}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ),
        )}
        {pending && (
          <li
            role="status"
            className={cn(PANEL, "max-w-[90%] p-4 text-ink-muted")}
          >
            <AdvisorTag /> <span className="ml-1">Thinking…</span>
          </li>
        )}
      </ol>
      <div ref={endRef} />

      <FormError message={error} />
      <FormError message={voiceError} />

      {!available ? (
        <p
          role="status"
          className="rounded-[10px] border border-brand/30 bg-brand-wash px-3.5 py-2.5 text-[13px] text-brand"
        >
          The advisor isn&apos;t available right now. Your progress and plan
          still work.
        </p>
      ) : (
        <>
          {messages.length === 1 && (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Suggested questions"
            >
              {starters.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  disabled={pending || voiceBusy}
                  className={cn(
                    BUTTON_SECONDARY,
                    "h-auto py-2 text-[13px] whitespace-normal",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2 max-[640px]:flex-col max-[640px]:items-stretch"
            onSubmit={(e) => {
              e.preventDefault();
              if (!voiceBusy) void ask(draft);
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              Your question
            </label>
            <textarea
              id={inputId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!voiceBusy) void ask(draft);
                }
              }}
              maxLength={MAX_MESSAGE}
              rows={2}
              placeholder="Ask about a requirement, a course or your plan…"
              className={cn(FIELD, "h-auto min-h-[64px] resize-y py-2.5")}
            />
            <div className="flex gap-2 max-[640px]:[&>*]:flex-1">
              <MicButton
                state={recorder.state}
                seconds={recorder.seconds}
                disabled={pending || !canUseMic}
                describedBy={voiceUnavailableReason ? voiceHelpId : undefined}
                title={voiceUnavailableReason ?? undefined}
                onStart={() => {
                  setVoiceError(null);
                  speaker.stop();
                  void recorder.start();
                }}
                onStop={recorder.stop}
              />
              <button
                type="submit"
                disabled={pending || !draft.trim() || voiceBusy}
                className={BUTTON_PRIMARY}
              >
                {pending ? "Asking…" : "Ask"}
              </button>
            </div>
          </form>
          {voiceUnavailableReason && (
            <p id={voiceHelpId} className={HINT}>
              {voiceUnavailableReason}
            </p>
          )}
          {(canUseMic || voice.speak) && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className={HINT}>{VOICE_NOTICE}</p>
              {voice.speak && (
                <SpeakerControls
                  on={speakerOn}
                  state={speaker.state}
                  onToggle={() => {
                    const next = !speakerOn;
                    speakerOnRef.current = next;
                    setSpeakerOn(next);
                    if (!next) speaker.stop();
                  }}
                  onStop={speaker.stop}
                />
              )}
            </div>
          )}
        </>
      )}
      <p className={HINT}>
        The advisor explains MyAdvisor&apos;s results and the SFU calendar. It
        isn&apos;t official advice, and this conversation isn&apos;t saved.
      </p>
    </div>
  );
}
