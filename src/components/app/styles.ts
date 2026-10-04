// Class strings for the signed-in app, taken from the landing page's visual language
// (src/components/landing/*): brand red and warm greys from globals.css, 12px panels with
// line-soft borders, 15px panel titles, 13px body text. No new colours or fonts.

export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** Bordered panel, as the landing preview's requirement list and cards. */
export const PANEL =
  "rounded-[12px] border border-line-soft bg-white text-[13px]";
export const PANEL_TITLE = "text-[15px] font-semibold tracking-[-0.01em]";
/** Small screen kicker above a title, e.g. "BBA · Finance · Fall 2026 requirements". */
export const KICKER = "text-[12px] text-ink-muted";
export const SCREEN_TITLE = "text-[21px] font-semibold tracking-[-0.02em]";
export const TAG =
  "rounded-[7px] border border-line-soft px-[9px] py-[5px] font-mono text-[11px] text-ink-body";

const BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-medium whitespace-nowrap transition-[background-color,border-color,scale] duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100";

/** Ink button, as the landing header's "Start planning". */
export const BUTTON_PRIMARY = `${BUTTON} bg-ink text-white hover:bg-black ${FOCUS}`;
/** White bordered button, as the landing "Try the sample student". */
export const BUTTON_SECONDARY = `${BUTTON} border border-line bg-white text-ink hover:border-[#C9C8C3] ${FOCUS}`;
/** Brand button for the one main call to action on a screen. */
export const BUTTON_BRAND = `${BUTTON} bg-brand text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`;
export const BUTTON_GHOST = `${BUTTON} h-9 px-3 text-ink-body hover:bg-surface-subtle hover:text-ink ${FOCUS}`;

/** Text input and select, overriding the shared Input primitive's defaults. */
export const FIELD =
  "h-10 w-full rounded-[10px] border border-line bg-white px-3 text-[14px] text-ink shadow-none outline-none placeholder:text-ink-muted focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/15 aria-invalid:border-brand aria-invalid:ring-2 aria-invalid:ring-brand/15";
export const LABEL = "text-[13px] font-medium text-ink";
export const HINT = "text-[12px] leading-[1.45] text-ink-muted";
export const FIELD_ERROR = "text-[12px] leading-[1.45] font-medium text-brand";
