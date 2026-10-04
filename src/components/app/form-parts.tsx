"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BUTTON_PRIMARY, FIELD_ERROR } from "./styles";

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
