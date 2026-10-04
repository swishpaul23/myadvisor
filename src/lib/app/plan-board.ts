import type { Plan, SavedPlan, StudentProfile } from "./types";

// The editable semester-card board on My plan: which item sits in which term. Pure and
// client-safe; the rules engine checks a board in plan-check.ts.

/** One draggable row: a named course, or a placeholder elective ("Your choice"). */
export type BoardItem = {
  /** The course code, or "@n" for the n-th placeholder elective of the generated plan. */
  id: string;
  code: string | null;
  label: string;
  note: string;
  units: number | null;
  closesGap: boolean;
};

export type BoardTerm = {
  termId: string;
  kind: "study" | "coop";
  itemIds: string[];
};

export type Board = { terms: BoardTerm[]; items: Record<string, BoardItem> };

export const isElectiveId = (id: string) => /^@\d{1,3}$/.test(id);

/** The generated plan as a board: named courses keyed by code, electives as @0, @1… */
export function boardFromPlan(plan: Plan): Board {
  const items: Record<string, BoardItem> = {};
  let elective = 0;
  const terms = plan.terms.map((t): BoardTerm => ({
    termId: t.termId,
    kind: t.kind,
    itemIds: t.courses.map((c) => {
      const id = c.code ?? `@${elective++}`;
      items[id] = {
        id,
        code: c.code,
        label: c.label,
        note: c.note,
        units: c.units,
        closesGap: c.closesGap,
      };
      return id;
    }),
  }));
  return { terms, items };
}

/** Moves an item to the end of another term. Unknown terms, or its own term, change nothing. */
export function moveItem(
  terms: BoardTerm[],
  itemId: string,
  toTermId: string,
): BoardTerm[] {
  const from = terms.find((t) => t.itemIds.includes(itemId));
  if (!from || from.termId === toTermId) return terms;
  if (!terms.some((t) => t.termId === toTermId)) return terms;
  return terms.map((t) =>
    t.termId === from.termId
      ? { ...t, itemIds: t.itemIds.filter((id) => id !== itemId) }
      : t.termId === toTermId
        ? { ...t, itemIds: [...t.itemIds, itemId] }
        : t,
  );
}

/** A term's units, or null when any item's units are unknown. A co-op term with nothing is 0. */
export function termUnits(
  term: BoardTerm,
  items: Record<string, BoardItem>,
): number | null {
  return term.itemIds.reduce<number | null>((n, id) => {
    const u = items[id]?.units ?? null;
    return n === null || u === null ? null : n + u;
  }, 0);
}

/** Whether two boards put the same items in the same terms, in the same order. */
export function sameLayout(a: BoardTerm[], b: BoardTerm[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (t, i) =>
        t.termId === b[i]!.termId &&
        t.kind === b[i]!.kind &&
        t.itemIds.join("\n") === b[i]!.itemIds.join("\n"),
    )
  );
}

/** FNV-1a, 32-bit, base 36: a short fingerprint, not a security measure. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * What a saved plan was built from: the course record (any order) and the plan settings
 * (start term, load, summer, co-op). Other survey answers don't shape the plan.
 */
export function planBasis(profile: StudentProfile): string {
  const courses = profile.courses
    .map((c) =>
      [c.code, c.term, c.status, c.grade, c.institution, c.units].join("|"),
    )
    .sort();
  return fingerprint(
    JSON.stringify([
      courses,
      profile.planTerm,
      profile.courseLoad,
      profile.surveyAnswers.summer ?? null,
      profile.coop,
      profile.admissionTerm,
      profile.concentrations,
    ]),
  );
}

/** The record or plan settings changed since this plan was saved. */
export const isPlanStale = (plan: SavedPlan, profile: StudentProfile) =>
  plan.basis !== planBasis(profile);

/** A board as it is saved: codes per term. */
export function toSavedTerms(terms: BoardTerm[]): SavedPlan["terms"] {
  return terms.map((t) => ({ id: t.termId, kind: t.kind, items: t.itemIds }));
}

export function fromSavedTerms(terms: SavedPlan["terms"]): BoardTerm[] {
  return terms.map((t) => ({ termId: t.id, kind: t.kind, itemIds: t.items }));
}
