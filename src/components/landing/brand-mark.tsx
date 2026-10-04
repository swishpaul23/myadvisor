import { cn } from "@/lib/utils";

const SIZES = {
  md: { box: "size-[26px] rounded-[7px]", icon: 15, stroke: 2.6 },
  sm: { box: "size-[22px] rounded-[6px]", icon: 13, stroke: 2.8 },
} as const;

/** The red MyAdvisor logo tile. Decorative: pair it with the visible name. */
export function BrandMark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex flex-none items-center justify-center bg-brand",
        s.box,
        className,
      )}
    >
      <svg
        width={s.icon}
        height={s.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={s.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 18 10 8l4 6 6-10" />
      </svg>
    </span>
  );
}
