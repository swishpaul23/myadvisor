import { SampleStudentLink, UploadTranscriptLink } from "./cta-links";
import {
  GapCard,
  RequirementList,
  SampleDataTag,
  UnitsProgressCard,
  VoiceReplyCard,
} from "./mockup-parts";

const MOCKUP_NAV = ["Overview", "Advisor", "My plan", "Academic record"];

const FLOATING_CARD =
  "absolute w-64 shadow-[0_20px_44px_rgba(0,0,0,0.22),0_0_0_1px_rgba(20,20,20,0.05)] max-[900px]:hidden";

/**
 * Hero copy plus the product preview. The site header (72px) sits above it, so the hero
 * fills the rest of the first viewport and the dark frame runs to its bottom edge.
 */
export function Hero() {
  return (
    <section
      id="hero"
      className="flex min-h-[calc(100svh-72px)] flex-col overflow-hidden bg-paper leading-[normal] text-ink"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-none flex-col items-center px-6 pt-20 text-center">
        <h1 className="max-w-[860px] text-[length:clamp(40px,5.4vw,76px)] leading-[1.03] font-semibold tracking-[-0.04em] text-balance">
          Plan your degree,
          <br />
          <span className="text-brand">term by term.</span>
        </h1>
        <p className="mt-5 max-w-[640px] text-[18px] leading-[1.6] text-balance text-ink-body">
          Upload your transcript, see exactly where you stand in your degree,
          and get a next-term plan by text or voice. Every answer shows its
          sources.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <UploadTranscriptLink />
          <SampleStudentLink />
        </div>
      </div>

      <div
        id="product-preview"
        role="img"
        aria-label="Preview of the MyAdvisor Overview screen with sample data: degree progress for a fictional BBA Finance student, a BUS 313 requirement gap with its SFU Calendar source, and a voice reply from the advisor."
        className="relative mx-auto mt-12 flex w-full max-w-[1200px] flex-[1_0_480px] px-6"
      >
        <div
          aria-hidden="true"
          className="flex flex-1 justify-center overflow-hidden rounded-t-[20px] bg-[#1C1C1E] pt-10 max-[900px]:px-4 max-[900px]:pt-5"
        >
          <div
            id="product-preview-window"
            className="mx-4 flex w-full max-w-[840px] overflow-hidden rounded-t-[12px] bg-white text-left shadow-[0_-1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="box-content flex w-[184px] flex-none flex-col gap-0.5 border-r border-line-soft bg-surface-subtle px-3 py-[18px] text-[13px] max-[900px]:hidden">
              <div className="flex items-center gap-2 px-2 pt-0.5 pb-4 font-semibold">
                <span className="size-4 rounded-[5px] bg-brand" />
                MyAdvisor
              </div>
              {MOCKUP_NAV.map((item, i) =>
                i === 0 ? (
                  <div
                    key={item}
                    className="rounded-[8px] border border-line-soft bg-white px-2.5 py-2 font-medium"
                  >
                    {item}
                  </div>
                ) : (
                  <div key={item} className="px-2.5 py-2 text-ink-body">
                    {item}
                  </div>
                ),
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4 px-7 py-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[12px] text-ink-muted">
                    BBA · Finance · Fall 2026 requirements
                  </div>
                  <div className="mt-1 text-[21px] font-semibold tracking-[-0.02em]">
                    Degree progress
                  </div>
                </div>
                <SampleDataTag />
              </div>
              <UnitsProgressCard
                label="Units completed"
                value={
                  <>
                    <b className="text-ink">78</b> / 120
                  </>
                }
              />
              <RequirementList />
            </div>
          </div>
        </div>

        <GapCard
          className={`${FLOATING_CARD} top-26 right-16`}
          aria-hidden="true"
        />
        <VoiceReplyCard
          className={`${FLOATING_CARD} top-61 left-16`}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
