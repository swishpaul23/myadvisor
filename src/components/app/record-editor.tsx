"use client";

import { useActionState, useState } from "react";
import { updateRecord } from "@/app/app/(shell)/record/actions";
import type { ActionResult, RecordCourse } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { CourseEditor } from "./course-editor";
import { FieldError, FormError, SubmitButton } from "./form-parts";
import { BUTTON_BRAND, BUTTON_PRIMARY, BUTTON_SECONDARY, HINT } from "./styles";

/** "Edit courses" toggle: the shared course editor, re-confirmed before it's saved. */
export function RecordEditor({
  courses,
  termOptions,
}: {
  courses: RecordCourse[];
  termOptions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(
    async (prev: ActionResult | null, form: FormData) => {
      const result = await updateRecord(prev, form);
      if (result.ok) setEditing(false); // close the editor once the save succeeds
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={BUTTON_PRIMARY}
        >
          Edit courses
        </button>
        {state?.ok && (
          <p role="status" className={HINT}>
            Saved. Your progress and plan are updated.
          </p>
        )}
      </div>
    );

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state && !state.ok ? state.error : null} />
      <CourseEditor
        initial={courses}
        termOptions={termOptions}
        errors={errors}
      />
      <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-line-soft px-3.5 py-3 text-[14px] has-[:checked]:border-ink has-[:checked]:bg-surface-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
        <input
          type="checkbox"
          name="confirm"
          className="mt-0.5 size-4 flex-none accent-ink"
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby="record-confirm-error"
        />
        <span>
          <span className="font-medium">Reviewed and confirmed</span>
          <span className={cn(HINT, "mt-0.5 block")}>
            Every course, term and grade above matches my transcript.
          </span>
        </span>
      </label>
      <FieldError id="record-confirm-error" message={errors.confirm} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className={BUTTON_SECONDARY}
        >
          Cancel
        </button>
        <SubmitButton pendingLabel="Saving…" className={BUTTON_BRAND}>
          Save my courses
        </SubmitButton>
      </div>
    </form>
  );
}
