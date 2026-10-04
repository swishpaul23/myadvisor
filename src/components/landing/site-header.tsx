import { BrandMark } from "./brand-mark";

// Placeholder targets until these pages exist.
const NAV_LINKS = [
  { label: "How it works", href: "#" },
  { label: "Degree progress", href: "#" },
  { label: "Planner", href: "#" },
  { label: "Sources", href: "#" },
] as const;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function SiteHeader() {
  return (
    <header className="bg-paper leading-[normal] text-ink">
      <div className="mx-auto grid h-18 w-full max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 max-[900px]:grid-cols-[1fr_auto]">
        <a
          href="#"
          className={`flex items-center gap-2.5 justify-self-start text-[17px] font-semibold tracking-[-0.02em] hover:text-black ${FOCUS}`}
        >
          <BrandMark />
          MyAdvisor
        </a>
        <nav
          aria-label="Main"
          className="flex gap-8 text-[14px] max-[900px]:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`text-ink-body ${FOCUS}`}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 justify-self-end">
          <a
            href="#"
            className={`inline-flex h-11 items-center px-3.5 text-[14px] text-[#3A3A38] ${FOCUS}`}
          >
            Log in
          </a>
          <a
            href="#"
            className={`inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-[14px] font-medium text-white ${FOCUS}`}
          >
            Start planning
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
