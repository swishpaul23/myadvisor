import { cn } from "@/lib/utils";
import { PANEL } from "./styles";

/** Placeholder blocks while a screen loads. */
export function LoadingPanel({
  label = "Loading…",
  lines = 3,
}: {
  label?: string;
  lines?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(PANEL, "flex flex-col gap-3 p-5")}
    >
      <span className="sr-only">{label}</span>
      <div className="h-5 w-40 animate-pulse rounded-[6px] bg-line-soft motion-reduce:animate-none" />
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-[10px] bg-surface-subtle motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/** A screen with nothing to show yet, with what to do about it. */
export function EmptyPanel({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(PANEL, "flex flex-col items-start gap-2 p-5")}>
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      {children && (
        <div className="leading-[1.5] text-ink-body">{children}</div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
