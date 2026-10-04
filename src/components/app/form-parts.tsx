"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BUTTON_PRIMARY, CHECK, CHOICE, FIELD_ERROR, HINT } from "./styles";

/** Plain-language error banner for a form. Announced to screen readers. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[10px] border border-brand/30 bg-brand-wash px-3.5 py-2.5 text-[13px] leading-[1.45] text-brand"
    >
      {message}
    </p>
  );
}

/** One field's error, linked to its input with aria-describedby={id}. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className={FIELD_ERROR}>
      {message}
    </p>
  );
}

/** Submit button that shows a pending label while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn(BUTTON_PRIMARY, className)}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** The "Reviewed and confirmed" tick for a course list (onboarding review, record upload). */
export function ConfirmCourses({ error }: { error?: string }) {
  return (
    <>
      <label className={cn(CHOICE, "items-start")}>
        <input
          type="checkbox"
          name="confirm"
          className={cn(CHECK, "mt-0.5")}
          aria-invalid={Boolean(error)}
          aria-describedby="confirm-error"
        />
        <span>
          I&apos;ve checked my courses, terms and grades, and they&apos;re
          correct.
          <span className={cn(HINT, "mt-0.5 block")}>
            Your degree progress is worked out from this list.
          </span>
        </span>
      </label>
      <FieldError id="confirm-error" message={error} />
    </>
  );
}
