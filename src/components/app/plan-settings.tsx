"use client";

import { useActionState } from "react";
import { updatePlanSettings } from "@/app/app/(shell)/plan/actions";
import { termLabel } from "@/lib/app/terms";
import { COURSE_LOADS } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { FieldError, FormError, SubmitButton } from "./form-parts";
import { BUTTON_SECONDARY, FIELD, LABEL, PANEL, PANEL_TITLE } from "./styles";

/** Change the planned term and course load; the engine recomputes the suggestion. */
export function PlanSettings({
  planTerm,
  courseLoad,
  termOptions,
}: {
  planTerm: string;
  courseLoad: number;
  termOptions: string[];
}) {
  const [state, formAction] = useActionState(updatePlanSettings, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const terms = termOptions.includes(planTerm)
    ? termOptions
    : [planTerm, ...termOptions];
  return (
    <form
      action={formAction}
      aria-label="Plan settings"
      className={cn(PANEL, "flex flex-col gap-3 p-4")}
      noValidate
    >
      <h2 className={PANEL_TITLE}>Plan settings</h2>
      <FormError message={state && !state.ok ? state.error : null} />
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 max-[640px]:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Term to plan</span>
          <select
            name="planTerm"
            defaultValue={planTerm}
            aria-invalid={Boolean(errors.planTerm)}
            aria-describedby="planTerm-error"
            className={FIELD}
          >
            {terms.map((t) => (
              <option key={t} value={t}>
                {termLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Courses that term</span>
          <select
            name="courseLoad"
            defaultValue={courseLoad}
            aria-invalid={Boolean(errors.courseLoad)}
            aria-describedby="courseLoad-error"
            className={FIELD}
          >
            {COURSE_LOADS.map((n) => (
              <option key={n} value={n}>
                {n} courses
              </option>
            ))}
          </select>
        </label>
        <SubmitButton pendingLabel="Updating…" className={BUTTON_SECONDARY}>
          Update plan
        </SubmitButton>
      </div>
      <FieldError id="planTerm-error" message={errors.planTerm} />
      <FieldError id="courseLoad-error" message={errors.courseLoad} />
      {state?.ok && (
        <p role="status" className="text-[12px] text-ink-muted">
          Plan updated.
        </p>
      )}
    </form>
  );
}
