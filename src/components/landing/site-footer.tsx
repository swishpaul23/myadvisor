import { SampleStudentLink, UploadTranscriptLink } from "./cta-links";
import { FooterWordmark } from "./footer-wordmark";
import styles from "./motion.module.css";

export function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-black leading-[normal] text-white">
      <div className="mx-auto box-content max-w-[1200px] px-6">
        <section
          data-reveal=""
          className={`flex flex-col items-center border-t border-[#1F1F1F] pt-28 pb-24 text-center ${styles.stagger}`}
        >
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

        <div
          data-reveal=""
          className={`flex items-center justify-center border-t border-[#1F1F1F] py-[22px] text-[13px] text-ink-faint ${styles.reveal}`}
        >
          <p>© 2026 MyAdvisor · Built at StormHacks 2026</p>
        </div>
      </div>

      <FooterWordmark />
    </footer>
  );
}
