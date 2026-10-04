import { cn } from "@/lib/utils";

/** The red MyAdvisor logo tile. Decorative: pair it with the visible name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-[26px] flex-none items-center justify-center rounded-[7px] bg-brand",
        className,
      )}
    >
      <svg
        width={15}
        height={15}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 18 10 8l4 6 6-10" />
      </svg>
    </span>
  );
}
