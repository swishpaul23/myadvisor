"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { saveTranscriptReview } from "@/app/app/start/actions";
import type { TranscriptResult } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { CourseEditor } from "./course-editor";
import { FormError, SubmitButton } from "./form-parts";
import { BUTTON_BRAND, BUTTON_SECONDARY, FOCUS, HINT, LABEL } from "./styles";

export type TranscriptRead = Extract<TranscriptResult, { ok: true }>;

type Phase =
  | { kind: "pick" }
  | { kind: "reading"; name: string }
  | { kind: "error"; message: string; manualOnly: boolean };

export const UPLOAD_UNAVAILABLE = "Upload unavailable, enter courses manually.";

export const PRIVACY_NOTICE =
  "Your file is sent to Google's Gemini API to read your courses. It isn't stored: MyAdvisor keeps only the course list you confirm.";

/** Upload a transcript PDF, then review and confirm what was read. */
export function TranscriptUpload({ termOptions }: { termOptions: string[] }) {
  const [result, setResult] = useState<TranscriptRead | null>(null);
  if (result) return <Review result={result} termOptions={termOptions} />;
  return (
    <TranscriptPicker
      onRead={setResult}
      back={
        <Link href="/app/start" className={BUTTON_SECONDARY}>
          Back
        </Link>
      }
      footer={
        <p className={HINT}>
          Prefer not to upload?{" "}
          <Link
            href="/app/start/courses"
            className={cn("text-ink underline underline-offset-2", FOCUS)}
          >
            Enter your courses manually
          </Link>
          .
        </p>
      }
    />
  );
}

/**
 * The privacy notice, file picker and "Reading…" state. Sends the PDF to /api/transcript
 * (Gemini) and hands what was read to onRead. Shared by onboarding and Academic record.
 */
export function TranscriptPicker({
  onRead,
  back,
  footer,
}: {
  onRead: (result: TranscriptRead) => void;
  back: ReactNode;
  footer?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const inputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();

  async function upload(file: File) {
    setPhase({ kind: "reading", name: file.name });
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/transcript", { method: "POST", body });
      const result = (await res.json()) as TranscriptResult;
      if (result.ok) onRead(result);
      else
        setPhase({
          kind: "error",
          message: result.message,
          manualOnly: result.error === "upload_unavailable",
        });
    } catch {
      setPhase({
        kind: "error",
        message:
          "The upload didn't go through. Check your connection and try again.",
        manualOnly: false,
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-[10px] bg-surface-subtle px-3.5 py-3 text-[13px] leading-[1.5] text-ink-body">
        {PRIVACY_NOTICE}
      </p>

      {phase.kind === "error" && <FormError message={phase.message} />}

      {phase.kind === "reading" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-[12px] border border-line-soft px-4 py-5"
        >
          <span
            aria-hidden="true"
            className="size-4 flex-none animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none"
          />
          <span>
            Reading <span className="font-medium">{phase.name}</span>… This can
            take up to a minute.
          </span>
        </div>
      ) : !(phase.kind === "error" && phase.manualOnly) ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const file = inputRef.current?.files?.[0];
            if (file) void upload(file);
          }}
        >
          <label htmlFor={fileId} className={LABEL}>
            Your unofficial transcript (PDF)
          </label>
          <input
            id={fileId}
            ref={inputRef}
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            required
            aria-describedby={`${fileId}-hint`}
            className={cn(
              "block w-full rounded-[10px] border border-dashed border-line bg-white px-3 py-3 text-[14px] text-ink-body file:mr-3 file:rounded-[8px] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-white",
              FOCUS,
            )}
          />
          <p id={`${fileId}-hint`} className={HINT}>
            Download it from goSFU (Academics → Unofficial Transcript). Up to 10
            MB.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
            {back}
            <button type="submit" className={BUTTON_BRAND}>
              Read my transcript
            </button>
          </div>
        </form>
      ) : null}

      {footer}
    </div>
  );
}

function Review({
  result,
  termOptions,
}: {
  result: TranscriptRead;
  termOptions: string[];
}) {
  const [state, formAction] = useActionState(saveTranscriptReview, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const flagged = Object.keys(result.flags).length;
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="rounded-[10px] bg-surface-subtle px-3.5 py-3 text-[13px] leading-[1.5] text-ink-body">
        We read <b className="text-ink">{result.courses.length} courses</b>.{" "}
        {flagged > 0
          ? `${flagged} ${flagged === 1 ? "row needs" : "rows need"} a check (highlighted). `
          : ""}
        Fix anything that doesn&apos;t match your transcript. You&apos;ll
        confirm the whole list once, at the end.
        {(result.cgpa !== null || result.standing) && (
          <span className="mt-1 block text-ink-muted">
            Also printed on your transcript:
            {result.cgpa !== null && ` CGPA ${result.cgpa.toFixed(2)}`}
            {result.standing && ` · ${result.standing}`}. Your progress is
            worked out from your courses, not these.
          </span>
        )}
      </div>
      <FormError message={state && !state.ok ? state.error : null} />
      <CourseEditor
        initial={result.courses}
        termOptions={termOptions}
        errors={errors}
        flags={result.flags}
        notes={result.notes}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
        <Link href="/app/start/upload" className={BUTTON_SECONDARY}>
          Upload a different file
        </Link>
        <SubmitButton pendingLabel="Saving…" className={BUTTON_BRAND}>
          Continue
        </SubmitButton>
      </div>
    </form>
  );
}
