import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Pieces of the hero's product preview. Everything here is illustrative sample data for a
 * fictional student, not engine output.
 */

type RequirementStatus = "complete" | "gap" | "progress";

type SampleRequirement = {
  label: string;
  detail?: string;
  status: RequirementStatus;
};

const SAMPLE_REQUIREMENTS: readonly SampleRequirement[] = [
  { label: "BBA core", status: "complete" },
  { label: "Finance concentration", detail: "BUS 313 missing", status: "gap" },
  { label: "Finance electives", detail: "1 of 3", status: "progress" },
  { label: "Writing, Quantitative, Breadth", status: "complete" },
  { label: "Upper-division units", detail: "27 of 45", status: "progress" },
];

const STATUS_TEXT: Record<RequirementStatus, string> = {
  complete: "Complete",
  gap: "Gap",
  progress: "In progress",
};

export function SampleDataTag() {
  return (
    <span className="rounded-[7px] border border-line-soft px-[9px] py-[5px] font-mono text-[11px] text-ink-body">
      Sample data
    </span>
  );
}

/** Units bar: 65% completed, 10% in progress (shown but not counted). */
export function UnitsProgressCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-line-soft p-4">
      <div className="flex justify-between text-[13px]">
        <span className="text-ink-body">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[#EFEEEA]">
        <div className="w-[65%] bg-ink" />
        <div className="w-[10%] bg-[repeating-linear-gradient(45deg,#9A9994_0_3px,#EFEEEA_3px_6px)]" />
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-ink-muted">
        <span>■ Completed</span>
        <span>▨ In progress (not counted)</span>
      </div>
    </div>
  );
}

function CheckIcon({
  size,
  strokeWidth,
}: {
  size: number;
  strokeWidth: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function BookIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5" />
    </svg>
  );
}

function StatusIcon({ status }: { status: RequirementStatus }) {
  if (status === "complete") {
    return (
      <span className="inline-flex size-5 flex-none items-center justify-center rounded-full bg-ink text-white">
        <CheckIcon size={12} strokeWidth={3} />
      </span>
    );
  }
  if (status === "gap") {
    return (
      <span className="size-5 flex-none rounded-full border-2 border-brand" />
    );
  }
  return (
    <span className="size-5 flex-none rounded-full border-2 border-dashed border-[#9A9994]" />
  );
}

/** Requirement status rows. */
export function RequirementList() {
  return (
    <div className="flex flex-col rounded-[12px] border border-line-soft text-[13px]">
      {SAMPLE_REQUIREMENTS.map((req) => (
        <div
          key={req.label}
          className={cn(
            "flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0",
            req.status === "gap" && "bg-brand-wash",
          )}
        >
          <StatusIcon status={req.status} />
          <span className="flex-1">
            {req.label}
            {req.detail && (
              <span className="text-ink-muted"> · {req.detail}</span>
            )}
          </span>
          <span
            className={
              req.status === "gap"
                ? "font-semibold text-brand"
                : "text-ink-muted"
            }
          >
            {STATUS_TEXT[req.status]}
          </span>
        </div>
      ))}
    </div>
  );
}

const CARD = "rounded-[14px] bg-white p-4 text-[13px]";

/** "Requirement gap" card for BUS 313 with its calendar source. */
export function GapCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn(CARD, className)} {...props}>
      <div className="flex items-center justify-between">
        <span className="text-ink-muted">Requirement gap</span>
        <span className="rounded-[6px] bg-brand-tint px-2 py-[3px] text-[11px] font-semibold text-brand">
          Action
        </span>
      </div>
      <div className="mt-2.5 text-[26px] font-semibold tracking-[-0.03em]">
        BUS 313
      </div>
      <div className="mt-1 leading-[1.45] text-ink-body">
        Required for the Finance concentration. Not on your record yet.
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3 text-[12px] text-ink-body">
        <BookIcon size={14} />
        SFU Calendar · Fall 2026 · BBA
      </div>
    </div>
  );
}

const WAVEFORM: readonly { height: number; played: boolean }[] = [
  { height: 8, played: true },
  { height: 16, played: true },
  { height: 22, played: true },
  { height: 12, played: true },
  { height: 18, played: true },
  { height: 9, played: false },
  { height: 15, played: false },
  { height: 20, played: false },
  { height: 11, played: false },
  { height: 6, played: false },
  { height: 14, played: false },
];

/** Advisor voice reply with its readable text beside the (static) audio player. */
export function VoiceReplyCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn(CARD, className)} {...props}>
      <div className="flex items-center gap-2">
        <span className="rounded-[6px] bg-paper px-2 py-[3px] text-[11px] font-medium">
          Advisor
        </span>
        <span className="text-[12px] text-ink-muted">Voice reply</span>
      </div>
      <div className="mt-2.5 text-ink-muted">
        “Can I take four courses next term?”
      </div>
      <div className="mt-1.5 leading-[1.45]">
        Yes. Put BUS 313 and one Finance elective in that term to close your
        gap.
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="inline-flex size-[30px] items-center justify-center rounded-full bg-brand text-white">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <path d="M7 5v14l12-7z" />
          </svg>
        </span>
        <span className="flex h-6 items-center gap-[3px]">
          {WAVEFORM.map((bar, i) => (
            <span
              key={i}
              className={cn(
                "w-[3px] rounded-[2px]",
                bar.played ? "bg-ink" : "bg-[#C9C8C3]",
              )}
              style={{ height: bar.height }}
            />
          ))}
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          0:12
        </span>
      </div>
    </div>
  );
}

const PANEL = "rounded-[12px] border border-line-soft text-[13px]";
const PANEL_TITLE = "text-[15px] font-semibold tracking-[-0.01em]";

const NEXT_TERM_DRAFT: readonly {
  course: string;
  note: string;
  strong: boolean;
  closesGap: boolean;
}[] = [
  { course: "BUS 313", note: "Closes gap", strong: true, closesGap: true },
  {
    course: "Finance elective",
    note: "2 of 3",
    strong: true,
    closesGap: false,
  },
  {
    course: "2 × open electives",
    note: "Your choice",
    strong: false,
    closesGap: false,
  },
];

/** Draft next-term plan. Labelled as a plan, not enrolment. */
export function NextTermDraftCard() {
  return (
    <div className={cn(PANEL, "flex flex-col p-4")}>
      <div className="flex items-center justify-between">
        <span className={PANEL_TITLE}>Next term · draft</span>
        <span className="font-mono text-[11px] text-ink-body">12 units</span>
      </div>
      <div className="mt-2.5 flex flex-col">
        {NEXT_TERM_DRAFT.map((row) => (
          <div
            key={row.course}
            className="flex justify-between border-b border-line-soft py-[9px] last:border-b-0"
          >
            <span className={row.strong ? "font-semibold" : undefined}>
              {row.course}
            </span>
            <span className={row.closesGap ? "text-brand" : "text-ink-muted"}>
              {row.note}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2.5 text-[12px] leading-[1.4] text-ink-muted">
        A plan, not enrolment. Seats aren’t checked.
      </div>
    </div>
  );
}

const PLAN_REASONS: readonly {
  label: string;
  tone: string;
  text: string;
}[] = [
  {
    label: "Verified",
    tone: "text-ink",
    text: "BUS 313 is required for Finance and isn’t on your record.",
  },
  {
    label: "Assumption",
    tone: "text-ink-muted",
    text: "Four courses is a manageable load, as you asked.",
  },
  {
    label: "Unresolved",
    tone: "text-brand",
    text: "Seats and timetable fit aren’t checked yet.",
  },
];

/** Verified facts, assumptions and unresolved items behind the draft plan. */
export function WhyThisPlanCard() {
  return (
    <div className={cn(PANEL, "flex flex-col gap-3 p-4")}>
      <span className={PANEL_TITLE}>Why this plan</span>
      {PLAN_REASONS.map((reason) => (
        <div key={reason.label} className="flex flex-col gap-1">
          <span
            className={cn(
              "text-[11px] font-semibold tracking-[0.06em] uppercase",
              reason.tone,
            )}
          >
            {reason.label}
          </span>
          <span className="leading-[1.45] text-[#3A3A38]">{reason.text}</span>
        </div>
      ))}
    </div>
  );
}

const RECORD_TOTALS: readonly { label: string; value: string; unit: string }[] =
  [
    { label: "Completed", value: "26", unit: "courses · 78 units" },
    { label: "In progress", value: "4", unit: "courses · 12 units" },
    { label: "Transfer", value: "0", unit: "units" },
  ];

/** Confirmed record totals, keeping completed, in-progress and transfer apart. */
export function AcademicRecordCard() {
  return (
    <div className={cn(PANEL, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <span className={PANEL_TITLE}>Academic record</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-body">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-ink text-white">
            <CheckIcon size={10} strokeWidth={3} />
          </span>
          Reviewed and confirmed
        </span>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
        {RECORD_TOTALS.map((total) => (
          <div
            key={total.label}
            className="rounded-[10px] bg-surface-subtle px-3.5 py-3"
          >
            <div className="text-[12px] text-ink-muted">{total.label}</div>
            <div className="mt-1 text-[20px] font-semibold tracking-[-0.03em]">
              {total.value}{" "}
              <span className="text-[13px] font-medium text-ink-muted">
                {total.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SOURCES_USED = [
  "SFU Calendar · BBA program requirements",
  "SFU Calendar · Finance concentration",
  "SFU Calendar · WQB requirements",
] as const;

/** Calendar pages the advice cites. Static rows, not links. */
export function SourcesUsedList() {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
        <span className={PANEL_TITLE}>Sources used</span>
        <span className="text-[12px] text-ink-muted">3 calendar pages</span>
      </div>
      {SOURCES_USED.map((source) => (
        <div
          key={source}
          className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3 last:border-b-0"
        >
          <BookIcon size={15} />
          <span className="flex-1">{source}</span>
          <span className="text-ink-muted">Fall 2026</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-muted"
          >
            <path d="M7 17 17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </div>
      ))}
    </div>
  );
}
