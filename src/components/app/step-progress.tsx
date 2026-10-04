import { cn } from "@/lib/utils";

/** "Step 2 of 5 · Your next term" with a segmented bar (done = ink, current = brand). */
export function StepProgress({
  steps,
  current,
}: {
  steps: readonly { title: string }[];
  current: number;
}) {
  const step = steps[current];
  return (
    <div>
      <p className="text-[12px] text-ink-muted">
        Step {current + 1} of {steps.length}
        {step && <span className="text-ink-body"> · {step.title}</span>}
      </p>
      <ol
        aria-label={`Onboarding progress: step ${current + 1} of ${steps.length}`}
        className="mt-2 flex gap-1.5"
      >
        {steps.map((s, i) => (
          <li
            key={s.title}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < current
                ? "bg-ink"
                : i === current
                  ? "bg-brand"
                  : "bg-line-soft",
            )}
          >
            <span className="sr-only">
              {s.title}
              {i < current ? " (done)" : i === current ? " (current)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
