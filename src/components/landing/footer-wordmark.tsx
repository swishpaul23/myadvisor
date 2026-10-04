"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import styles from "./motion.module.css";

const WORDMARK = "MyAdvisor";
/** "My" keeps the darker ink; "Advisor" is a shade lighter, as in the static design. */
const FIRST_WORD_LENGTH = 2;
/** Lift in em for the hovered letter and its neighbours, by distance. */
const LIFT_EM = [-0.09, -0.05, -0.02] as const;
/**
 * Geist SemiBold kerning after each letter, in em. Splitting the word into inline-blocks
 * loses kerning between letters, so it is put back as a margin to keep the resting
 * wordmark identical to the unsplit text.
 */
const KERNING_EM = [
  -0.01, -0.05, -0.0228, -0.01, -0.01, -0.01, -0.01, -0.01, 0,
] as const;

function letterStyle(index: number, active: number | null): CSSProperties {
  const distance = active === null ? -1 : Math.abs(index - active);
  const lift = distance >= 0 ? LIFT_EM[distance] : undefined;
  return {
    "--i": index,
    marginInlineEnd: `${KERNING_EM[index]}em`,
    translate: lift === undefined ? undefined : `0 ${lift}em`,
  } as CSSProperties;
}

function canAnimate(event: PointerEvent) {
  return (
    event.pointerType === "mouse" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The footer's decorative "MyAdvisor" wordmark. With a mouse, a red spotlight follows the
 * cursor across the letters and the letters under it lift. Touch and reduced motion get the
 * static wordmark (plus a one-time rise as it scrolls into view, via scroll-reveal.tsx).
 * Hidden from assistive technology; the footer's text carries the content.
 */
export function FooterWordmark() {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  const [lit, setLit] = useState(false);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const root = rootRef.current;
    if (root === null) return;
    const rect = root.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      root.style.setProperty("--spot-x", `${x}px`);
      root.style.setProperty("--spot-y", `${y}px`);
    });
    if (!lit) setLit(true);
  }

  function handlePointerLeave() {
    cancelAnimationFrame(frameRef.current);
    setLit(false);
    setActive(null);
  }

  const letters = (onEnter?: (index: number) => void) =>
    [...WORDMARK].map((char, index) => (
      <span
        key={index}
        className={cn(
          styles.letter,
          index >= FIRST_WORD_LENGTH && onEnter && "text-[#1C1C1C]",
        )}
        style={letterStyle(index, active)}
        onPointerEnter={
          onEnter
            ? (event) => {
                if (canAnimate(event)) onEnter(index);
              }
            : undefined
        }
      >
        {char}
      </span>
    ));

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-lit={lit ? "" : undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        "relative mx-auto box-content max-w-[1200px] px-6 pt-2 text-center text-[length:clamp(72px,15.5vw,228px)] leading-[0.74] font-semibold tracking-[-0.06em] whitespace-nowrap text-[#141414] select-none",
        styles.wordmark,
      )}
    >
      <span data-reveal="" className={styles.letters}>
        {letters(setActive)}
      </span>
      <span className={cn("px-6 pt-2", styles.spotlight)}>{letters()}</span>
    </div>
  );
}
