"use client";

import { Mic, Square, Volume2, VolumeX } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ApiError, TranscribeReply } from "@/lib/app/types";
import { MAX_CLIP_BYTES, MAX_CLIP_SECONDS } from "@/lib/app/voice";
import { cn } from "@/lib/utils";
import { BUTTON_GHOST, BUTTON_SECONDARY } from "./styles";

// Push-to-talk and read-aloud for the Advisor. Audio stays in memory: clips go straight to
// /api/advisor/transcribe, answers come back from /api/advisor/speak, and nothing is kept.

/** Clips shorter than this are treated as "no speech" without calling the server. */
const MIN_CLIP_MS = 400;
const VOICE_DOWN = "Voice isn't working right now. Type your question instead.";

// Whether this browser can record. False during server rendering.
const noSubscribe = () => () => {};
const canRecord = () =>
  typeof MediaRecorder !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);

/** The first recording format this browser supports (Safari records MP4, others WebM). */
function recorderMimeType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
}

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access is blocked. Allow it in your browser's site settings, or type your question.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found. Type your question instead.";
  return "The microphone couldn't start. Type your question instead.";
}

export type RecorderState = "idle" | "starting" | "recording" | "transcribing";

/**
 * Push-to-talk: start() opens the mic, stop() sends the clip for transcription and hands the
 * text to onText. Recording stops by itself at MAX_CLIP_SECONDS.
 */
export function useRecorder({
  onText,
  onError,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const supported = useSyncExternalStore(noSubscribe, canRecord, () => false);
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timersRef = useRef<number[]>([]);
  // A ref, not state: a second click during the permission prompt must see it at once.
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const callbacks = useRef({ onText, onError });
  useEffect(() => {
    callbacks.current = { onText, onError };
  });

  const clearTimers = () => {
    // clearTimeout also clears intervals (they share one ID pool).
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  async function transcribe(clip: Blob) {
    setState("transcribing");
    try {
      const form = new FormData();
      form.set("audio", clip, "clip");
      const res = await fetch("/api/advisor/transcribe", {
        method: "POST",
        body: form,
      });
      const reply = (await res
        .json()
        .catch(() => null)) as TranscribeReply | null;
      if (reply?.ok) callbacks.current.onText(reply.text);
      else callbacks.current.onError(reply?.message ?? VOICE_DOWN);
    } catch {
      callbacks.current.onError(
        "Your recording didn't go through. Check your connection and try again.",
      );
    } finally {
      busyRef.current = false;
      setState("idle");
    }
  }

  async function start() {
    if (busyRef.current) return;
    busyRef.current = true;
    setState("starting");
    const fail = (message: string) => {
      busyRef.current = false;
      setState("idle");
      callbacks.current.onError(message);
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      fail(micErrorMessage(err));
      return;
    }
    // The student left the page while the permission prompt was open.
    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const mimeType = recorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 48_000,
      });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      fail("The microphone couldn't start. Type your question instead.");
      return;
    }
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      clearTimers();
      stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      const clip = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (Date.now() - startedAt < MIN_CLIP_MS || clip.size === 0)
        fail("We didn't catch any speech. Press Speak, ask, then press Send.");
      else if (clip.size > MAX_CLIP_BYTES)
        fail("That recording is too long. Keep questions under a minute.");
      else void transcribe(clip);
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setState("recording");
    timersRef.current.push(
      window.setInterval(
        () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
        250,
      ),
      window.setTimeout(stop, MAX_CLIP_SECONDS * 1000),
    );
  }

  // Leaving the page mid-recording releases the mic and sends nothing.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (!recorder) return;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return { supported, state, seconds, start, stop };
}

export type SpeakerState = "idle" | "loading" | "playing";

/** Reads answers aloud through /api/advisor/speak. stop() cancels loading or playback. */
export function useSpeaker({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<SpeakerState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const release = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setState("idle");
  }, [release]);

  const speak = useCallback(
    async (text: string) => {
      release();
      const audio = (audioRef.current ??= new Audio());
      const controller = new AbortController();
      abortRef.current = controller;
      setState("loading");
      try {
        const res = await fetch("/api/advisor/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const reply = (await res.json().catch(() => null)) as ApiError | null;
          throw new Error(
            reply?.message ??
              "Read-aloud isn't working right now. The answer is above.",
          );
        }
        const clip = await res.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(clip);
        urlRef.current = url;
        audio.src = url;
        audio.onended = stop;
        audio.onerror = () => {
          stop();
          onErrorRef.current(
            "This answer couldn't be played. The answer is above.",
          );
        };
        await audio.play();
        setState("playing");
      } catch (err) {
        if (controller.signal.aborted) return;
        release();
        setState("idle");
        if (err instanceof DOMException && err.name === "NotAllowedError")
          onErrorRef.current(
            "Your browser blocked audio. The answer is above.",
          );
        else if (err instanceof Error && !(err instanceof DOMException))
          onErrorRef.current(err.message);
        else
          onErrorRef.current(
            "Read-aloud isn't working right now. The answer is above.",
          );
      }
    },
    [release, stop],
  );

  useEffect(() => release, [release]);

  return { state, speak, stop };
}

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Press to talk, press again to send. */
export function MicButton({
  state,
  seconds,
  disabled,
  onStart,
  onStop,
}: {
  state: RecorderState;
  seconds: number;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (state === "recording")
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn(
          BUTTON_SECONDARY,
          "border-brand text-brand hover:border-brand",
        )}
      >
        <Square size={14} aria-hidden="true" className="fill-current" />
        Send{" "}
        <span className="font-mono text-[12px] tabular-nums">
          {clock(seconds)}
        </span>
        <span className="sr-only">
          {" "}
          Recording. Press to stop and send. Stops by itself at one minute.
        </span>
      </button>
    );
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled || state !== "idle"}
      className={BUTTON_SECONDARY}
    >
      <Mic size={16} aria-hidden="true" />
      {state === "transcribing"
        ? "Transcribing…"
        : state === "starting"
          ? "Starting mic…"
          : "Speak"}
      <span className="sr-only"> (ask by voice)</span>
    </button>
  );
}

/** Read-aloud on or off, plus a stop button while an answer is loading or playing. */
export function SpeakerControls({
  on,
  state,
  onToggle,
  onStop,
}: {
  on: boolean;
  state: SpeakerState;
  onToggle: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cn(BUTTON_GHOST, "text-[13px]")}
      >
        {on ? (
          <Volume2 size={16} aria-hidden="true" />
        ) : (
          <VolumeX size={16} aria-hidden="true" />
        )}
        Read answers aloud
      </button>
      {state !== "idle" && (
        <button
          type="button"
          onClick={onStop}
          className={cn(
            BUTTON_GHOST,
            "text-[13px] text-brand hover:text-brand",
          )}
        >
          <Square size={12} aria-hidden="true" className="fill-current" />
          {state === "loading" ? "Cancel audio" : "Stop audio"}
        </button>
      )}
    </div>
  );
}
