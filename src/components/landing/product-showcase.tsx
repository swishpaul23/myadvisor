import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import {
  GapCard,
  RequirementList,
  SampleDataTag,
  UnitsProgressCard,
  VoiceReplyCard,
} from "./mockup-parts";

// Illustrative sample data for a fictional student, not engine output.
const SAMPLE_STATS = [
  { label: "Units completed", value: "78", suffix: " / 120" },
  { label: "In progress", value: "12", suffix: " units" },
  { label: "Requirement groups", value: "9", suffix: " of 12 met" },
] as const;

const NEXT_TERM_DRAFT = [
  { course: "BUS 313", note: "Closes gap", tone: "brand", strong: true },
  { course: "Finance elective", note: "2 of 3", tone: "muted", strong: true },
  {
    course: "2 × open electives",
    note: "Your choice",
    tone: "muted",
    strong: false,
  },
] as const;

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
} as const;

const SIDEBAR_NAV: readonly { label: string; icon: ReactNode }[] = [
  {
    label: "Overview",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Advisor",
    icon: (
      <svg {...ICON_PROPS} strokeLinejoin="round">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
    ),
  },
  {
    label: "My plan",
    icon: (
      <svg {...ICON_PROPS} strokeLinecap="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
      </svg>
    ),
  },
  {
    label: "Academic record",
    icon: (
      <svg {...ICON_PROPS} strokeLinejoin="round">
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6" />
      </svg>
    ),
  },
];

/** Section 2: the full Overview screen on black. A static illustration, no interaction. */
export function ProductShowcase() {
  return (
    <section
      id="showcase"
      className="flex min-h-svh items-center justify-center bg-black px-6 py-16 leading-[normal] text-ink"
    >
      <div
        id="product-showcase"
        role="img"
        aria-label="Preview of the MyAdvisor Overview screen with sample data for a fictional BBA Finance student: units completed, requirement groups with their SFU Calendar sources, a BUS 313 requirement gap, a voice reply from the advisor, and a draft next-term plan."
        className="flex w-full max-w-[1240px] overflow-hidden rounded-[16px] bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_40px_120px_rgba(255,255,255,0.06)]"
      >
        <div
          aria-hidden="true"
          className="box-content flex w-[212px] flex-none flex-col gap-0.5 border-r border-line-soft bg-surface-subtle px-3.5 py-[18px] text-[13px] max-[780px]:hidden"
        >
          <div className="flex items-center gap-[9px] px-2 pt-0.5 pb-5 text-[15px] font-semibold tracking-[-0.02em]">
            <BrandMark size="sm" />
            MyAdvisor
          </div>
          {SIDEBAR_NAV.map((item, i) => (
            <div
              key={item.label}
              className={
                i === 0
                  ? "flex items-center gap-2.5 rounded-[8px] border border-line-soft bg-white px-2.5 py-[9px] font-medium"
                  : "flex items-center gap-2.5 px-2.5 py-[9px] text-ink-body"
              }
            >
              {item.icon}
              {item.label}
            </div>
          ))}
          <div className="mt-auto flex items-center gap-2.5 border-t border-line-soft p-2.5">
            <span className="inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">
              SP
            </span>
            <span className="min-w-0 leading-[1.3]">
              Stuart Paul
              <br />
              <span className="text-[12px] text-ink-muted">BBA · Finance</span>
            </span>
          </div>
        </div>

        <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[58px] flex-none items-center justify-between gap-4 border-b border-line-soft px-6">
            <span className="text-[14px] text-ink-muted">
              Overview <span className="px-1.5 text-[#C9C8C3]">/</span>
              <span className="font-medium text-ink">Degree progress</span>
            </span>
            <span className="flex h-[34px] w-80 items-center gap-2 rounded-[9px] border border-[#E6E5E1] px-2.5 text-[13px] text-ink-faint max-[780px]:hidden">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              Ask the advisor…
              <span className="ml-auto rounded-[4px] border border-[#E6E5E1] px-[5px] py-px font-mono text-[10px]">
                ⌘K
              </span>
            </span>
            <SampleDataTag />
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col gap-[18px] p-7">
              <div>
                <div className="text-[12px] text-ink-muted">
                  BBA · Finance · Fall 2026 requirements
                </div>
                <div className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">
                  Degree progress
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                {SAMPLE_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-[12px] border border-line-soft px-4 py-3.5"
                  >
                    <div className="text-[12px] text-ink-muted">
                      {stat.label}
                    </div>
                    <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.03em]">
                      {stat.value}
                      <span className="text-[14px] font-medium text-ink-faint">
                        {stat.suffix}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <UnitsProgressCard
                label="Progress to 120 units"
                value={
                  <>
                    <b>65%</b>{" "}
                    <span className="text-ink-faint">+ 10% in progress</span>
                  </>
                }
              />

              <RequirementList withSource />
            </div>

            <div className="box-content flex w-[300px] flex-none flex-col gap-3.5 border-l border-line-soft bg-surface-subtle px-5 py-6 text-[13px] max-[1100px]:hidden">
              <GapCard className="border border-line-soft" />
              <VoiceReplyCard className="border border-line-soft" />

              <div className="rounded-[14px] border border-line-soft bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Next term · draft</span>
                  <span className="font-mono text-[11px] text-ink-body">
                    12 units
                  </span>
                </div>
                <div className="mt-2.5 flex flex-col">
                  {NEXT_TERM_DRAFT.map((row) => (
                    <div
                      key={row.course}
                      className="flex justify-between border-b border-line-soft py-2 last:border-b-0"
                    >
                      <span className={row.strong ? "font-semibold" : ""}>
                        {row.course}
                      </span>
                      <span
                        className={
                          row.tone === "brand" ? "text-brand" : "text-ink-muted"
                        }
                      >
                        {row.note}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 text-[12px] leading-[1.4] text-ink-muted">
                  A plan, not enrolment. Seats aren’t checked.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
