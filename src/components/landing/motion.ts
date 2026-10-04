import type { CSSProperties } from "react";

/** Inline style that offsets a motion.module.css animation by `ms` milliseconds. */
export function motionDelay(ms: number): CSSProperties {
  return { "--motion-delay": `${ms}ms` } as CSSProperties;
}
