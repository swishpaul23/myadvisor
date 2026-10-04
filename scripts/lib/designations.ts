import { DESIGNATIONS } from "@/lib/data/schema";

// Explicit lookup from SFU's `info.designation` strings to W/Q/B codes. The API joins
// several designations with "/" and abbreviates breadths after the first one, e.g.
// "Breadth-Hum/Social Sci/Science". Every string seen so far is listed in
// docs/outlines-api.md. Anything this table can't resolve is an error: never guess.

export type Designation = (typeof DESIGNATIONS)[number];

/** Whole strings that mean "no designation". */
const NONE = new Set(["N/A", ""]);

/** Tokens that stand on their own. */
const TOKENS: Record<string, Designation> = {
  Writing: "W",
  Quantitative: "Q",
  "Breadth-Social Sciences": "B-Soc",
  "Breadth-Soc": "B-Soc",
  "Breadth-Social Sci": "B-Soc",
  "Breadth-Humanities": "B-Hum",
  "Breadth-Hum": "B-Hum",
  "Breadth-Science": "B-Sci",
};

/** Abbreviated breadths, valid only after a "Breadth-..." token in the same string. */
const BREADTH_CONTINUATIONS: Record<string, Designation> = {
  "Social Sciences": "B-Soc",
  "Social Sci": "B-Soc",
  Humanities: "B-Hum",
  Science: "B-Sci",
};

export type DesignationResult =
  { ok: true; codes: Designation[] } | { ok: false; unresolved: string[] };

export function expandDesignation(raw: string): DesignationResult {
  if (NONE.has(raw.trim())) return { ok: true, codes: [] };

  const codes = new Set<Designation>();
  const unresolved: string[] = [];
  let afterBreadth = false;
  for (const part of raw.split("/").map((p) => p.trim())) {
    const token = TOKENS[part];
    const continuation = afterBreadth ? BREADTH_CONTINUATIONS[part] : undefined;
    const code = token ?? continuation;
    if (code === undefined) {
      unresolved.push(part);
      continue;
    }
    codes.add(code);
    if (token?.startsWith("B-")) afterBreadth = true;
  }
  if (unresolved.length > 0) return { ok: false, unresolved };
  // Canonical order: W, Q, B-Soc, B-Hum, B-Sci.
  return { ok: true, codes: DESIGNATIONS.filter((d) => codes.has(d)) };
}
