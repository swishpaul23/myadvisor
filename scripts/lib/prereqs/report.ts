import type { PrereqRecord } from "@/lib/data/prereqs";
import { courseCodes } from "./nodes";

// Reporting helpers for prereqs.json: group unknown fragments by pattern, list the most
// common ones, and cross-check the course codes the parser found.

/** First matching pattern names the group. Order matters. */
const PATTERNS: [string, RegExp][] = [
  ["GPA", /\bC?GPA\b/],
  [
    "topic-dependent or to be determined",
    /\b(vary|varies|topic|to be determined|as stated|dependent on|specified)\b/i,
  ],
  [
    "cannot-take or credit rule",
    /\b(may not take|for further credit|not for credit|credit towards)\b/i,
  ],
  ["co-op or application", /\b(co-op|apply|application|Criminal Record)\b/i],
  ["permission or approval", /\b(permission|approval|approved project)\b/i],
  [
    "admission or program restriction",
    /\b(only open|open only|admitted|admission|reserved for|enrolled|enrollment|majors?|minors?|honours|program|students)\b/i,
  ],
  [
    "high school or non-course credential",
    /\b(Pre-Calculus|Foundations of Mathematics|FAN|Job Practicum)\b/,
  ],
  [
    "course count by level or subject",
    /(\d{3}-division|\d{3}-level|\bdivision\b|prior philosophy course|\bunits (?:in|of)\b|\bW course\b)/i,
  ],
  ["unit limit", /\bno more than\b/i],
  ["ambiguous course logic", /\b[A-Z]{2,5} \d{3}/],
];

export function fragmentPattern(text: string): string {
  return PATTERNS.find(([, re]) => re.test(text))?.[0] ?? "other";
}

export type FragmentCount = { text: string; count: number; pattern: string };

/** The `limit` most common unknown fragments across all records (ties by text). */
export function topFragments(
  records: PrereqRecord[],
  limit: number,
): FragmentCount[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const f of r.unparsed_fragments)
      counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts]
    .map(([text, count]) => ({ text, count, pattern: fragmentPattern(text) }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);
}

/** Course codes in parsed nodes that are in neither known set, with the courses citing them. */
export function codesWithoutData(
  records: PrereqRecord[],
  known: ReadonlySet<string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of records) {
    for (const code of new Set([
      ...courseCodes(r.prereq),
      ...courseCodes(r.coreq),
    ])) {
      if (known.has(code)) continue;
      (out[code] ??= []).push(r.code);
    }
  }
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );
}
