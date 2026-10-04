import { SampleStudentLink, UploadTranscriptLink } from "./cta-links";

export function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-black leading-[normal] text-white">
      <div className="mx-auto box-content max-w-[1200px] px-6">
        <section className="flex flex-col items-center border-t border-[#1F1F1F] pt-28 pb-24 text-center">
          <h2 className="text-[length:clamp(36px,4.4vw,60px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance">
            Your next term,
            <br />
            <span className="text-brand">planned.</span>
          </h2>
          <p className="mt-[18px] max-w-[460px] text-[17px] leading-[1.6] text-balance text-[#A1A19C]">
            Start with your transcript. Leave with a plan you can explain.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <UploadTranscriptLink />
            <SampleStudentLink tone="dark" />
          </div>
        </section>

        <div className="flex items-center justify-center border-t border-[#1F1F1F] py-[22px] text-[13px] text-ink-faint">
          <p>© 2026 MyAdvisor · Built at StormHacks 2026</p>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mx-auto box-content max-w-[1200px] px-6 pt-2 text-center text-[length:clamp(72px,15.5vw,228px)] leading-[0.74] font-semibold tracking-[-0.06em] whitespace-nowrap text-[#141414] select-none"
      >
        My<span className="text-[#1C1C1C]">Advisor</span>
      </div>
    </footer>
  );
}
