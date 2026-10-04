import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BUTTON_PRIMARY,
  FOCUS,
  HINT,
  KICKER,
  PANEL,
  PANEL_TITLE,
} from "@/components/app/styles";
import { firstOpenStep, stepIndex, STEPS } from "@/lib/app/onboarding";
import { readState } from "@/lib/app/store";
import { cn } from "@/lib/utils";

const ENTRY_CHOICES = [
  {
    href: "/app/start/program",
    title: "Fill in your profile",
    body: "Answer a few questions about your program, then add your courses yourself.",
  },
  {
    href: "/app/start/upload",
    title: "Upload a transcript",
    body: "Upload your unofficial SFU transcript (PDF). You check every course before it's used.",
  },
  {
    href: "/app/start/sample",
    title: "Try the sample student",
    body: "Explore with a fictional BBA Finance student. No personal information needed.",
  },
] as const;

export const metadata = { title: "Get started · MyAdvisor" };

export default async function StartPage() {
  const { draft, profile } = await readState();
  // Onboarding is done once; after that, courses are edited in Academic record.
  if (profile) redirect("/app");
  const resume = draft ? firstOpenStep(draft) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className={KICKER}>SFU BBA · Fall 2026 requirements</p>
        <h1 className="mt-1 text-[28px] leading-[1.15] font-semibold tracking-[-0.03em]">
          Let&apos;s see where you stand.
        </h1>
        <p className="mt-2 max-w-[560px] text-[15px] leading-[1.6] text-ink-body">
          MyAdvisor needs your program and the courses you&apos;ve taken. Choose
          how you&apos;d like to start.
        </p>
      </div>

      {resume && (
        <div
          className={cn(
            PANEL,
            "flex flex-wrap items-center justify-between gap-3 p-4",
          )}
        >
          <div>
            <p className={PANEL_TITLE}>Continue where you left off</p>
            <p className={cn(HINT, "mt-0.5")}>
              Step {stepIndex(resume) + 1} of {STEPS.length} ·{" "}
              {STEPS[stepIndex(resume)]!.title}
            </p>
          </div>
          <Link href={`/app/start/${resume}`} className={BUTTON_PRIMARY}>
            Continue
          </Link>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-3">
        {ENTRY_CHOICES.map((choice) => (
          <li key={choice.href}>
            <Link
              href={choice.href}
              className={cn(
                PANEL,
                "flex h-full flex-col gap-1.5 p-4 transition-colors hover:border-line",
                FOCUS,
              )}
            >
              <span className={PANEL_TITLE}>{choice.title}</span>
              <span className="leading-[1.45] text-ink-body">
                {choice.body}
              </span>
              <span aria-hidden="true" className="mt-auto pt-2 text-ink-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
