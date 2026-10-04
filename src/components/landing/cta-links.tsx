import { cn } from "@/lib/utils";

const BASE =
  "inline-flex h-12 items-center rounded-[11px] px-[22px] text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2";

// href="#" is a placeholder until the upload and sample-student flows exist.

export function UploadTranscriptLink() {
  return (
    <a
      href="#"
      className={cn(
        BASE,
        "gap-[9px] bg-brand text-white focus-visible:outline-brand",
      )}
    >
      <svg
        aria-hidden="true"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 16V4" />
        <path d="m6 10 6-6 6 6" />
        <path d="M4 20h16" />
      </svg>
      Upload a transcript
    </a>
  );
}

const SAMPLE_TONES = {
  light: "border-line bg-white text-ink focus-visible:outline-ink",
  dark: "border-[#2A2A2A] bg-[#111111] text-white focus-visible:outline-white",
} as const;

export function SampleStudentLink({
  tone = "light",
}: {
  tone?: keyof typeof SAMPLE_TONES;
}) {
  return (
    <a href="#" className={cn(BASE, "border", SAMPLE_TONES[tone])}>
      Try the sample student
    </a>
  );
}
