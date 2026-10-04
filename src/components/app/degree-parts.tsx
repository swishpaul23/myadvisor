import { ArrowUpRight, BookOpen, Check } from "lucide-react";
import Link from "next/link";
import type {
  ChecklistItem,
  ItemStatus,
  RecordSummary,
  UnitsSummary,
} from "@/lib/app/present";
import { termLabel } from "@/lib/app/terms";
import type { Claim, Gap, Plan, Source } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { ClaimLabel } from "./claim-label";
import { FOCUS, PANEL, PANEL_TITLE, TAG } from "./styles";

// Data-driven versions of the landing preview's pieces (src/components/landing/
// mockup-parts.tsx): same tokens, sizes, status marks and card styles, filled from the
// engine's results instead of sample data.

export const DATA_NOTE = "Requirement data not yet checked by an advisor.";

export function SampleDataTag() {
  return <span className={TAG}>Sample data</span>;
}

/** Units bar: completed (solid) and in progress (hatched, shown but not counted). */
export function UnitsCard({ units }: { units: UnitsSummary }) {
  const total = units.required ?? 120;
  const done = Math.min((units.completed / total) * 100, 100);
  const now = Math.min((units.inProgress / total) * 100, 100 - done);
  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="flex justify-between text-[13px]">
        <span className="text-ink-body">Units completed</span>
        <span className="font-mono">
          <b className="text-ink">{units.completed}</b> / {total}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${units.completed} of ${total} units completed, ${units.inProgress} in progress`}
        className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[#EFEEEA]"
      >
        <div className="bg-ink" style={{ width: `${done}%` }} />
        <div
          className="bg-[repeating-linear-gradient(45deg,#9A9994_0_3px,#EFEEEA_3px_6px)]"
          style={{ width: `${now}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <span>■ Completed</span>
        <span>▨ In progress, {units.inProgress} units (not counted)</span>
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<ItemStatus, string> = {
  complete: "Complete",
  in_progress: "In progress",
  gap: "Gap",
  unresolved: "Unresolved",
};

function StatusMark({ status }: { status: ItemStatus }) {
  if (status === "complete")
    return (
      <span className="inline-flex size-5 flex-none items-center justify-center rounded-full bg-ink text-white">
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  if (status === "gap")
    return (
      <span className="size-5 flex-none rounded-full border-2 border-brand" />
    );
  if (status === "unresolved")
    return (
      <span className="inline-flex size-5 flex-none items-center justify-center rounded-full border-2 border-ink-muted text-[11px] font-semibold text-ink-muted">
        ?
      </span>
    );
  return (
    <span className="size-5 flex-none rounded-full border-2 border-dashed border-[#9A9994]" />
  );
}

/** Requirement status rows, as the landing preview's list. */
export function RequirementChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className={cn(PANEL, "flex flex-col")} aria-label="Requirement status">
      {items.map((item) => (
        <li
          key={item.key}
          className={cn(
            "flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0",
            item.status === "gap" && "bg-brand-wash",
          )}
        >
          <StatusMark status={item.status} />
          <span className="min-w-0 flex-1">
            {item.label}
            {item.detail && (
              <span className="text-ink-muted"> · {item.detail}</span>
            )}
          </span>
          <span
            className={
              item.status === "gap" || item.status === "unresolved"
                ? "font-semibold text-brand"
                : "text-ink-muted"
            }
          >
            {STATUS_TEXT[item.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SourceLine({
  source,
  className,
}: {
  source: Source;
  className?: string;
}) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 text-[12px] text-ink-body underline-offset-2 hover:text-ink hover:underline",
        FOCUS,
        className,
      )}
    >
      <BookOpen size={14} aria-hidden="true" className="flex-none" />
      {source.title} · Fall 2026
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** "Requirement gap" callout for the most important missing course. */
export function GapCallout({ gap, more }: { gap: Gap; more: number }) {
  return (
    <section
      aria-label="Requirement gap"
      className={cn(PANEL, "border-brand/25 p-4")}
    >
      <div className="flex items-center justify-between">
        <span className="text-ink-muted">Requirement gap</span>
        <span className="rounded-[6px] bg-brand-tint px-2 py-[3px] text-[11px] font-semibold text-brand">
          Action
        </span>
      </div>
      <p className="mt-2.5 text-[26px] font-semibold tracking-[-0.03em]">
        {gap.label}
      </p>
      <p className="mt-1 leading-[1.45] text-ink-body">
        {gap.detail}
        {more > 0 &&
          ` ${more} more required ${more === 1 ? "course isn't" : "courses aren't"} on your record either.`}
      </p>
      <div className="mt-3 border-t border-line-soft pt-3">
        <SourceLine source={gap.source} />
      </div>
    </section>
  );
}

/** Draft next-term plan. Labelled as a plan, not enrolment. */
export function NextTermCard({
  plan,
  link = true,
}: {
  plan: Plan;
  link?: boolean;
}) {
  return (
    <section
      aria-label="Next term draft"
      className={cn(PANEL, "flex flex-col p-4")}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className={PANEL_TITLE}>{termLabel(plan.termId)} · draft</h2>
        {plan.units !== null && (
          <span className="font-mono text-[11px] text-ink-body">
            {plan.units} units
          </span>
        )}
      </div>
      <ul className="mt-2.5 flex flex-col">
        {plan.courses.map((row) => (
          <li
            key={row.label}
            className="flex justify-between gap-3 border-b border-line-soft py-[9px] last:border-b-0"
          >
            <span className={row.code ? "font-semibold" : undefined}>
              {row.label}
            </span>
            <span
              className={cn(
                "text-right",
                row.closesGap ? "text-brand" : "text-ink-muted",
              )}
            >
              {row.note}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-2.5 text-[12px] leading-[1.4] text-ink-muted">
        A plan, not enrolment. Seats and timetable aren&apos;t checked.
      </p>
      {link && (
        <Link
          href="/app/plan"
          className={cn(
            "mt-2 self-start text-[12px] text-ink underline underline-offset-2",
            FOCUS,
          )}
        >
          Open my plan
        </Link>
      )}
    </section>
  );
}

/** Verified facts, assumptions and unresolved items behind the plan. */
export function WhyThisPlan({
  claims,
  limit,
  link = false,
}: {
  claims: Claim[];
  limit?: number;
  link?: boolean;
}) {
  // A short version keeps one of each kind, like the landing preview.
  const shown = limit
    ? (["verified", "assumption", "unresolved"] as const)
        .map((s) => claims.find((c) => c.status === s))
        .filter((c): c is Claim => Boolean(c))
        .slice(0, limit)
    : claims;
  return (
    <section
      aria-label="Why this plan"
      className={cn(PANEL, "flex flex-col gap-3 p-4")}
    >
      <h2 className={PANEL_TITLE}>Why this plan</h2>
      <ul className="flex flex-col gap-3">
        {shown.map((claim) => (
          <li key={claim.text} className="flex flex-col gap-1">
            <ClaimLabel status={claim.status} />
            <span className="leading-[1.45] text-[#3A3A38]">{claim.text}</span>
            {claim.source && !limit && (
              <SourceLine source={claim.source} className="mt-0.5" />
            )}
          </li>
        ))}
      </ul>
      {link && claims.length > shown.length && (
        <Link
          href="/app/plan"
          className={cn(
            "self-start text-[12px] text-ink underline underline-offset-2",
            FOCUS,
          )}
        >
          See all {claims.length} reasons
        </Link>
      )}
    </section>
  );
}

/** Confirmed record totals, keeping completed, in-progress and transfer apart. */
export function RecordCard({
  record,
  link = true,
}: {
  record: RecordSummary;
  link?: boolean;
}) {
  const totals = [
    {
      label: "Completed",
      value: record.completed.courses,
      unit: `courses · ${record.completed.units} units`,
    },
    {
      label: "In progress",
      value: record.inProgress.courses,
      unit: `courses · ${record.inProgress.units} units`,
    },
    { label: "Transfer", value: record.transfer.units, unit: "units" },
  ];
  return (
    <section aria-label="Academic record" className={cn(PANEL, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={PANEL_TITLE}>Academic record</h2>
        {record.confirmed && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-body">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-ink text-white">
              <Check size={10} strokeWidth={3} aria-hidden="true" />
            </span>
            Reviewed and confirmed
          </span>
        )}
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
        {totals.map((t) => (
          <div
            key={t.label}
            className="rounded-[10px] bg-surface-subtle px-3.5 py-3"
          >
            <div className="text-[12px] text-ink-muted">{t.label}</div>
            <div className="mt-1 text-[20px] font-semibold tracking-[-0.03em]">
              {t.value}{" "}
              <span className="text-[13px] font-medium text-ink-muted">
                {t.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
      {link && (
        <Link
          href="/app/record"
          className={cn(
            "mt-3 inline-block text-[12px] text-ink underline underline-offset-2",
            FOCUS,
          )}
        >
          View or edit my courses
        </Link>
      )}
    </section>
  );
}

/** Calendar pages the advice cites, each a link. */
export function SourcesList({
  sources,
  link = true,
}: {
  sources: Source[];
  link?: boolean;
}) {
  return (
    <section aria-label="Sources used" className={PANEL}>
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
        <h2 className={PANEL_TITLE}>Sources used</h2>
        {link ? (
          <Link
            href="/app/sources"
            className={cn(
              "text-[12px] text-ink-muted underline-offset-2 hover:underline",
              FOCUS,
            )}
          >
            {sources.length} calendar {sources.length === 1 ? "page" : "pages"}
          </Link>
        ) : (
          <span className="text-[12px] text-ink-muted">
            {sources.length} calendar {sources.length === 1 ? "page" : "pages"}
          </span>
        )}
      </div>
      <ul>
        {sources.map((s) => (
          <li key={s.url} className="border-b border-line-soft last:border-b-0">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2.5 px-4 py-3 hover:bg-surface-subtle",
                FOCUS,
              )}
            >
              <BookOpen size={15} aria-hidden="true" className="flex-none" />
              <span className="flex-1">{s.title}</span>
              <span className="text-ink-muted">Fall 2026</span>
              <ArrowUpRight
                size={14}
                aria-hidden="true"
                className="text-ink-muted"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
