"use client";

import { useActionState } from "react";
import { updatePlanSettings } from "@/app/app/(shell)/plan/actions";
import { termLabel } from "@/lib/app/terms";
import { COURSE_LOADS } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { FieldError, FormError, SubmitButton } from "./form-parts";
import { BUTTON_SECONDARY, FIELD, LABEL, PANEL, PANEL_TITLE } from "./styles";

const SUMMER_OPTIONS = [
  ["full", "Yes, a full load"],
  ["some", "Yes, one or two courses"],
  ["no", "No summer courses"],
  ["unsure", "Not sure yet (left out)"],
] as const;

/** Change the start term, course load and summer terms; the engine recomputes the plan. */
export function PlanSettings({
  planTerm,
  courseLoad,
  summer,
  termOptions,
}: {
  planTerm: string;
  courseLoad: number;
  /** The summer answer (full, some, no, unsure, skip), if any. */
  summer?: string;
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
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3 max-[900px]:grid-cols-2 max-[640px]:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Start term</span>
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
          <span className={LABEL}>Courses per term</span>
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
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Summer terms</span>
          <select
            name="summer"
            defaultValue={
              summer === "full" || summer === "some" || summer === "no"
                ? summer
                : "unsure"
            }
            aria-invalid={Boolean(errors.summer)}
            aria-describedby="summer-error"
            className={FIELD}
          >
            {SUMMER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
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
      <FieldError id="summer-error" message={errors.summer} />
      {state?.ok && (
        <p role="status" className="text-[12px] text-ink-muted">
          Plan updated.
        </p>
      )}
    </form>
  );
}
