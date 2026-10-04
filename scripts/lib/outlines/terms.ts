// SFU terms in calendar order: spring, summer, fall.
export const TERM_NAMES = ["spring", "summer", "fall"] as const;
export type TermName = (typeof TERM_NAMES)[number];
export type Term = { year: number; term: TermName };

export function parseTerm(key: string): Term {
  const match = /^(\d{4})\/(spring|summer|fall)$/.exec(
    key.trim().toLowerCase(),
  );
  if (!match) throw new Error(`"${key}" is not a term like "2026/fall"`);
  return { year: Number(match[1]), term: match[2] as TermName };
}

export function termKey(t: Term): string {
  return `${t.year}/${t.term}`;
}

function ordinal(t: Term): number {
  return t.year * 3 + TERM_NAMES.indexOf(t.term);
}

export function compareTerms(a: Term, b: Term): number {
  return ordinal(a) - ordinal(b);
}

/** The `count` terms ending at `end` (inclusive), oldest first. */
export function lastTerms(end: Term, count: number): Term[] {
  const endOrdinal = ordinal(end);
  return Array.from({ length: count }, (_, i) => {
    const n = endOrdinal - (count - 1 - i);
    return { year: Math.floor(n / 3), term: TERM_NAMES[n % 3] as TermName };
  });
}
