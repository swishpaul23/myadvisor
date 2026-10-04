"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";
import { saveTranscriptReview } from "@/app/app/start/actions";
import type { TranscriptResult } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { CourseEditor } from "./course-editor";
import { FieldError, FormError, SubmitButton } from "./form-parts";
import { BUTTON_BRAND, BUTTON_SECONDARY, FOCUS, HINT, LABEL } from "./styles";

type Phase =
  | { kind: "pick" }
  | { kind: "reading"; name: string }
  | { kind: "error"; message: string; manualOnly: boolean }
  | { kind: "review"; result: Extract<TranscriptResult, { ok: true }> };

export const PRIVACY_NOTICE =
  "Your file is sent to Google's Gemini API to read your courses. It isn't stored: MyAdvisor keeps only the course list you confirm.";

/** Upload a transcript PDF, then review and confirm what was read. */
export function TranscriptUpload({ termOptions }: { termOptions: string[] }) {
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
      if (result.ok) setPhase({ kind: "review", result });
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

  if (phase.kind === "review")
    return <Review result={phase.result} termOptions={termOptions} />;

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
            <Link href="/app/start" className={BUTTON_SECONDARY}>
              Back
            </Link>
            <button type="submit" className={BUTTON_BRAND}>
              Read my transcript
            </button>
          </div>
        </form>
      ) : null}

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
    </div>
  );
}

function Review({
  result,
  termOptions,
}: {
  result: Extract<TranscriptResult, { ok: true }>;
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
        Fix anything that doesn&apos;t match your transcript before confirming.
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
      />
      <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-line-soft px-3.5 py-3 text-[14px] has-[:checked]:border-ink has-[:checked]:bg-surface-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
        <input
          type="checkbox"
          name="confirm"
          className="mt-0.5 size-4 flex-none accent-ink"
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby="confirm-error"
        />
        <span>
          <span className="font-medium">Reviewed and confirmed</span>
          <span className={cn(HINT, "mt-0.5 block")}>
            Every course, term and grade above matches my transcript.
          </span>
        </span>
      </label>
      <FieldError id="confirm-error" message={errors.confirm} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
        <Link href="/app/start/upload" className={BUTTON_SECONDARY}>
          Upload a different file
        </Link>
        <SubmitButton pendingLabel="Saving…" className={BUTTON_BRAND}>
          Save my courses
        </SubmitButton>
      </div>
    </form>
  );
}
