"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { BUTTON_PRIMARY, PANEL } from "./styles";

/** Body of an error.tsx boundary: a plain-language message and a retry, never a stack trace. */
export function ErrorPanel({
  error,
  reset,
  title = "Something went wrong on this page.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  useEffect(() => {
    // The digest lets us find the server log entry; the message stays out of the UI.
    console.error("Screen error", error.digest ?? "");
  }, [error]);
  return (
    <div
      role="alert"
      className={cn(PANEL, "flex flex-col items-start gap-2 p-5")}
    >
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      <p className="leading-[1.5] text-ink-body">
        Your saved information is safe. Try again, and if it keeps happening,
        sign out and back in.
      </p>
      <button
        type="button"
        onClick={reset}
        className={cn(BUTTON_PRIMARY, "mt-2")}
      >
        Try again
      </button>
    </div>
  );
}
