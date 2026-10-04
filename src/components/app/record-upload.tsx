"use client";

import { useActionState, useState } from "react";
import { importTranscript } from "@/app/app/(shell)/record/actions";
import {
  diffRecord,
  type CourseChange,
  type MergeMode,
} from "@/lib/app/record-merge";
import { termLabel } from "@/lib/app/terms";
import {
  MAX_COURSES,
  recordCourseSchema,
  type ActionResult,
  type RecordCourse,
} from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { CourseEditor } from "./course-editor";
import { ConfirmCourses, FormError, SubmitButton } from "./form-parts";
import {
  BUTTON_BRAND,
  BUTTON_SECONDARY,
  CHECK,
  CHOICE,
  HINT,
  PANEL,
  PANEL_TITLE,
} from "./styles";
import {
  PRIVACY_NOTICE,
  TranscriptPicker,
  UPLOAD_UNAVAILABLE,
  type TranscriptRead,
} from "./transcript-upload";

// Academic record: upload a transcript, review what was read (same table and tick as
// onboarding), then see how it compares with the record and choose how to add it.

type Step =
  | { kind: "closed" }
  | { kind: "pick" }
  | {
      kind: "review";
      read: TranscriptRead;
      rows: RecordCourse[];
      errors: Record<string, string>;
    }
  | { kind: "compare"; read: TranscriptRead; rows: RecordCourse[] };

const FIELD_NAMES: Record<string, string> = {
  term: "term",
  status: "status",
  grade: "grade",
  institution: "SFU or transfer",
  units: "units",
};

const describe = (c: RecordCourse) =>
  [
    termLabel(c.term),
    c.status === "in_progress" ? "in progress" : (c.grade ?? "—"),
    c.institution === "transfer" ? "transfer" : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** The editor's rows, normalized like the server will (codes upper-cased) when they're valid. */
function readRows(form: FormData): RecordCourse[] {
  try {
    const raw = JSON.parse(String(form.get("courses") ?? "[]")) as unknown[];
    return raw.map((r) => {
      const parsed = recordCourseSchema.safeParse(r);
      return parsed.success ? parsed.data : (r as RecordCourse);
    });
  } catch {
    return [];
  }
}

function CourseList({
  title,
  courses,
  hint,
}: {
  title: string;
  courses: RecordCourse[];
  hint?: string;
}) {
  return (
    <section aria-label={title} className={cn(PANEL, "p-4")}>
      <h3 className="text-[14px] font-semibold">
        {title}{" "}
        <span className="font-normal text-ink-muted">({courses.length})</span>
      </h3>
      {hint && <p className={cn(HINT, "mt-0.5")}>{hint}</p>}
      {courses.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {courses.map((c) => (
            <li
              key={`${c.code}-${c.term}`}
              className="flex justify-between gap-3 border-b border-line-soft py-1.5 last:border-b-0"
            >
              <span className="font-medium">{c.code}</span>
              <span className="text-ink-body">{describe(c)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChangeList({ changes }: { changes: CourseChange[] }) {
  return (
    <section aria-label="Changed" className={cn(PANEL, "p-4")}>
      <h3 className="text-[14px] font-semibold">
        Changed{" "}
        <span className="font-normal text-ink-muted">({changes.length})</span>
      </h3>
      <p className={cn(HINT, "mt-0.5")}>
        Grades, terms or status that differ from your record.
      </p>
      {changes.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {changes.map((c) => (
            <li
              key={`${c.before.code}-${c.before.term}`}
              className="flex flex-wrap justify-between gap-x-3 border-b border-line-soft py-1.5 last:border-b-0"
            >
              <span className="font-medium">
                {c.after.code}
                <span className="font-normal text-ink-muted">
                  {" "}
                  · {c.fields.map((f) => FIELD_NAMES[f] ?? f).join(", ")}
                </span>
              </span>
              <span className="text-ink-body">
                {describe(c.before)} <span aria-hidden="true">→</span>
                <span className="sr-only"> becomes </span> {describe(c.after)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Compare({
  current,
  rows,
  onBack,
  onDone,
  onErrors,
}: {
  current: RecordCourse[];
  rows: RecordCourse[];
  onBack: () => void;
  onDone: () => void;
  onErrors: (errors: Record<string, string>) => void;
}) {
  const [mode, setMode] = useState<MergeMode>("merge");
  const diff = diffRecord(current, rows);
  const [state, formAction] = useActionState(
    async (prev: ActionResult | null, form: FormData) => {
      const result = await importTranscript(prev, form);
      if (result.ok) onDone();
      else if (
        result.fieldErrors &&
        Object.keys(result.fieldErrors).some((k) => k.startsWith("courses"))
      )
        onErrors(result.fieldErrors);
      return result;
    },
    null,
  );
  const mergedCount = current.length + diff.added.length;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="courses" value={JSON.stringify(rows)} />
      <input type="hidden" name="confirm" value="on" />
      <p className="rounded-[10px] bg-surface-subtle px-3.5 py-3 text-[13px] leading-[1.5] text-ink-body">
        Compared with your record:{" "}
        <b className="text-ink">{diff.added.length} new</b>,{" "}
        <b className="text-ink">{diff.changed.length} changed</b>,{" "}
        {diff.same.length} already on your record.
      </p>
      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <CourseList
          title="New"
          courses={diff.added}
          hint="Not on your record yet. They'll be added."
        />
        <ChangeList changes={diff.changed} />
        <CourseList
          title="Already on your record"
          courses={diff.same}
          hint="Same course, term and grade. Nothing to do."
        />
        <CourseList
          title="Not on this transcript"
          courses={diff.missing}
          hint={
            mode === "replace"
              ? "These will be removed from your record."
              : "These stay on your record."
          }
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium">
          How should these courses go on your record?
        </legend>
        <label className={CHOICE}>
          <input
            type="radio"
            name="mode"
            value="merge"
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
            className={CHECK}
          />
          <span>
            Add new and update changed
            <span className={cn(HINT, "block")}>
              Nothing is removed from your record.
            </span>
          </span>
        </label>
        <label className={CHOICE}>
          <input
            type="radio"
            name="mode"
            value="replace"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
            className={CHECK}
          />
          <span>
            Replace my whole list
            <span className={cn(HINT, "block")}>
              {diff.missing.length > 0
                ? `Removes ${diff.missing.length} ${diff.missing.length === 1 ? "course" : "courses"} that ${diff.missing.length === 1 ? "isn't" : "aren't"} on this transcript.`
                : "Your record becomes exactly this transcript's list."}
            </span>
          </span>
        </label>
      </fieldset>
      {mode === "merge" && mergedCount > MAX_COURSES && (
        <p className={HINT}>
          That would be {mergedCount} courses; a record can hold up to{" "}
          {MAX_COURSES}.
        </p>
      )}
      <FormError message={state && !state.ok ? state.error : null} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
        <button type="button" onClick={onBack} className={BUTTON_SECONDARY}>
          Back to review
        </button>
        <SubmitButton pendingLabel="Saving…" className={BUTTON_BRAND}>
          {mode === "replace" ? "Replace my list" : "Add to my record"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** "Upload transcript" on Academic record: read, review, compare, then merge or replace. */
export function RecordUpload({
  current,
  termOptions,
  available,
}: {
  current: RecordCourse[];
  termOptions: string[];
  /** False when the Gemini key is missing: upload is unavailable. */
  available: boolean;
}) {
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [done, setDone] = useState(false);
  const [confirmError, setConfirmError] = useState<string | undefined>();

  if (step.kind === "closed")
    return (
      <section className={cn(PANEL, "flex flex-col gap-3 p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={PANEL_TITLE}>Upload transcript</h2>
            <p className={HINT}>
              Add new courses and grades from your latest unofficial transcript.
            </p>
          </div>
          {available && (
            <button
              type="button"
              onClick={() => {
                setDone(false);
                setStep({ kind: "pick" });
              }}
              className={BUTTON_SECONDARY}
            >
              Upload transcript
            </button>
          )}
        </div>
        {!available && (
          <p
            role="status"
            className="rounded-[10px] border border-brand/30 bg-brand-wash px-3.5 py-2.5 text-[13px] text-brand"
          >
            {UPLOAD_UNAVAILABLE}
          </p>
        )}
        {available && <p className={HINT}>{PRIVACY_NOTICE}</p>}
        {done && (
          <p role="status" className={HINT}>
            Saved. Your progress and plan are updated.
          </p>
        )}
      </section>
    );

  const close = () => setStep({ kind: "closed" });
  return (
    <section
      aria-label="Upload transcript"
      className={cn(PANEL, "flex flex-col gap-4 p-4")}
    >
      <h2 className={PANEL_TITLE}>Upload transcript</h2>
      {step.kind === "pick" && (
        <TranscriptPicker
          onRead={(read) =>
            setStep({ kind: "review", read, rows: read.courses, errors: {} })
          }
          back={
            <button type="button" onClick={close} className={BUTTON_SECONDARY}>
              Cancel
            </button>
          }
        />
      )}
      {step.kind === "review" && (
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (form.get("confirm") !== "on") {
              setConfirmError("Confirm that your course list is correct.");
              return;
            }
            setConfirmError(undefined);
            setStep({ kind: "compare", read: step.read, rows: readRows(form) });
          }}
        >
          <div className="rounded-[10px] bg-surface-subtle px-3.5 py-3 text-[13px] leading-[1.5] text-ink-body">
            We read{" "}
            <b className="text-ink">{step.read.courses.length} courses</b>.{" "}
            {Object.keys(step.read.flags).length > 0
              ? `${Object.keys(step.read.flags).length} ${Object.keys(step.read.flags).length === 1 ? "row needs" : "rows need"} a check (highlighted). `
              : ""}
            Fix anything that doesn&apos;t match your transcript. Next
            you&apos;ll see how it compares with your record.
          </div>
          <FormError
            message={
              Object.keys(step.errors).length > 0
                ? "Some rows need fixing. See the highlighted fields."
                : null
            }
          />
          <CourseEditor
            key={JSON.stringify(step.rows)}
            initial={step.rows}
            termOptions={termOptions}
            errors={step.errors}
            flags={step.rows === step.read.courses ? step.read.flags : {}}
            notes={step.rows === step.read.courses ? step.read.notes : {}}
          />
          <ConfirmCourses error={confirmError} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
            <button type="button" onClick={close} className={BUTTON_SECONDARY}>
              Cancel
            </button>
            <button type="submit" className={BUTTON_BRAND}>
              Compare with my record
            </button>
          </div>
        </form>
      )}
      {step.kind === "compare" && (
        <Compare
          current={current}
          rows={step.rows}
          onBack={() =>
            setStep({
              kind: "review",
              read: step.read,
              rows: step.rows,
              errors: {},
            })
          }
          onErrors={(errors) =>
            setStep({
              kind: "review",
              read: step.read,
              rows: step.rows,
              errors,
            })
          }
          onDone={() => {
            setDone(true);
            close();
          }}
        />
      )}
    </section>
  );
}
