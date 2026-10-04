"use client";

import { useEffect } from "react";

/** The product frame fades in during the hero load-in (see hero.tsx). */
const INTRO_ROOT_ID = "product-preview";
/** Extra delay for elements that animate as part of the load-in, so they play once visible. */
const INTRO_BASE_DELAY = "450ms";

/**
 * Drives the one-time reveals in motion.module.css for server-rendered `[data-reveal]`
 * elements. Renders nothing.
 *
 * The server markup is fully visible. After hydration, only elements below the fold are set
 * to "pending" (hidden) and then to "in" as they scroll into view, so nothing on screen
 * flashes. Elements already on screen keep their final state, except inside the product
 * frame while it is still invisible at the start of the load-in: those animate with it.
 * Reduced motion, or no IntersectionObserver, leaves everything as rendered.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.dataset.reveal = "in";
          observer.unobserve(el);
        }
      },
      // A ratio, not a negative root margin, so short elements at the very bottom of the
      // page still trigger when the page is scrolled to the end.
      { threshold: 0.2 },
    );

    const introRoot = document.getElementById(INTRO_ROOT_ID);
    const introHidden =
      introRoot !== null && Number(getComputedStyle(introRoot).opacity) < 0.05;
    const viewportHeight = window.innerHeight;

    for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      const state = el.dataset.reveal;
      if (state === "pending") {
        // Effect re-run (Strict Mode or Fast Refresh): keep watching.
        observer.observe(el);
        continue;
      }
      if (state !== "") continue;

      const rect = el.getBoundingClientRect();
      if (rect.top >= viewportHeight) {
        el.dataset.reveal = "pending";
        observer.observe(el);
      } else if (introHidden && introRoot.contains(el) && rect.bottom > 0) {
        el.style.setProperty("--motion-base", INTRO_BASE_DELAY);
        el.dataset.reveal = "in";
      }
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
