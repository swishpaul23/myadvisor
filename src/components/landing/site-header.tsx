import { BrandMark } from "./brand-mark";
import styles from "./motion.module.css";

// Placeholder targets until these pages exist.
const NAV_LINKS = [
  { label: "How it works", href: "#" },
  { label: "Degree progress", href: "#" },
  { label: "Planner", href: "#" },
  { label: "Sources", href: "#" },
] as const;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const EASE = "ease-[cubic-bezier(0.2,0.7,0.2,1)]";

// Underline grows from the left on hover and retracts to the right.
const NAV_LINK = `relative text-ink-body transition-colors duration-200 hover:text-ink after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.2,0.7,0.2,1)] hover:after:origin-left hover:after:scale-x-100 motion-reduce:after:transition-none`;

export function SiteHeader() {
  return (
    <header
      className={`sticky top-0 z-40 bg-paper leading-[normal] text-ink ${styles.header}`}
    >
      <div
        className={`mx-auto grid h-18 w-full max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 max-[900px]:grid-cols-[1fr_auto] ${styles.introFade}`}
      >
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
              className={`${NAV_LINK} ${FOCUS}`}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 justify-self-end">
          <a
            href="/sign-in"
            className={`inline-flex h-11 items-center px-3.5 text-[14px] text-[#3A3A38] transition-colors duration-200 hover:text-ink ${FOCUS}`}
          >
            Log in
          </a>
          <a
            href="/app/start"
            className={`group inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-[14px] font-medium text-white transition-[background-color,scale] duration-200 ${EASE} hover:bg-black active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${FOCUS}`}
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
              className={`transition-transform duration-300 ${EASE} group-hover:translate-x-[3px] motion-reduce:transition-none motion-reduce:group-hover:translate-x-0`}
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
