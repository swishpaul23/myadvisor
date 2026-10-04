import { cn } from "@/lib/utils";

// Hover lifts 1px and presses back on click. Tailwind's hover variant only applies on
// devices that can hover; motion-reduce drops the movement.
const BASE =
  "inline-flex h-12 items-center rounded-[11px] px-[22px] text-[15px] font-medium transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100";

// A soft light sheen crosses the red button on hover. It only transitions while hovered, so
// it resets off-screen on leave instead of sweeping back.
const SHEEN =
  "relative isolate overflow-hidden before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:-z-10 before:w-1/2 before:-translate-x-[150%] before:skew-x-[-20deg] before:bg-linear-to-r before:from-transparent before:via-white/25 before:to-transparent hover:before:translate-x-[260%] hover:before:transition-transform hover:before:duration-700 hover:before:ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:before:hidden";

// href="#" is a placeholder until the upload and sample-student flows exist.

export function UploadTranscriptLink() {
  return (
    <a
      href="#"
      className={cn(
        BASE,
        SHEEN,
        "gap-[9px] bg-brand text-white hover:shadow-[0_10px_22px_-10px_rgba(200,30,42,0.7)] focus-visible:outline-brand",
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
  light:
    "border-line bg-white text-ink hover:border-[#C9C8C3] hover:shadow-[0_8px_18px_-10px_rgba(20,20,20,0.3)] focus-visible:outline-ink",
  dark: "border-[#2A2A2A] bg-[#111111] text-white hover:border-[#3A3A3A] focus-visible:outline-white",
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
