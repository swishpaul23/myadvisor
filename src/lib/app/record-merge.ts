import type { RecordCourse } from "./types";

// Merging a newly uploaded transcript into the student's course list (Academic record).
// Pure and client-safe: the review screen shows the diff, the server action applies it.
// Courses match on code + term. When a code has exactly one attempt on the record and one on
// the transcript, in different terms but otherwise identical (status and grade), it is the
// same course with its term corrected; with a different grade it is a new attempt (a retake).

export type MergeMode = "merge" | "replace";

export type CourseChange = {
  before: RecordCourse;
  after: RecordCourse;
  /** What differs: some of "term", "status", "grade", "institution", "units". */
  fields: (keyof RecordCourse)[];
};

export type RecordDiff = {
  /** On the transcript, not on the record. */
  added: RecordCourse[];
  /** On both, with a different term, status, grade, institution or units. */
  changed: CourseChange[];
  /** On both, identical. */
  same: RecordCourse[];
  /** On the record, not on the transcript: kept unless the student replaces the list. */
  missing: RecordCourse[];
};

const key = (c: RecordCourse) => `${c.code}|${c.term}`;

/** The transcript's row with the student's own units kept when the transcript has none. */
const updated = (before: RecordCourse, after: RecordCourse): RecordCourse => ({
  ...after,
  units: after.units ?? before.units,
});

function changedFields(
  before: RecordCourse,
  after: RecordCourse,
): (keyof RecordCourse)[] {
  const fields = (["term", "status", "grade", "institution"] as const).filter(
    (f) => before[f] !== after[f],
  );
  return after.units !== null && after.units !== before.units
    ? [...fields, "units"]
    : [...fields];
}

/** Rows of a list without repeats of the same code + term (the first one wins). */
export function dedupe(courses: RecordCourse[]): RecordCourse[] {
  const seen = new Set<string>();
  return courses.filter((c) => !seen.has(key(c)) && seen.add(key(c)));
}

export function diffRecord(
  current: RecordCourse[],
  uploaded: RecordCourse[],
): RecordDiff {
  const incoming = dedupe(uploaded);
  const byKey = new Map(current.map((c) => [key(c), c]));
  const count = (list: RecordCourse[], code: string) =>
    list.filter((c) => c.code === code).length;
  const matched = new Set<RecordCourse>();
  const diff: RecordDiff = { added: [], changed: [], same: [], missing: [] };

  const pairs: [RecordCourse | undefined, RecordCourse][] = incoming.map(
    (u) => {
      const exact = byKey.get(key(u));
      if (exact) matched.add(exact);
      return [exact, u];
    },
  );
  for (const [exact, u] of pairs) {
    let before = exact;
    // A term correction: one attempt on each side, and the record's isn't matched exactly.
    if (
      !before &&
      count(current, u.code) === 1 &&
      count(incoming, u.code) === 1
    ) {
      const only = current.find((c) => c.code === u.code)!;
      if (
        !matched.has(only) &&
        only.status === u.status &&
        only.grade === u.grade
      )
        before = only;
    }
    if (!before) {
      diff.added.push(u);
      continue;
    }
    matched.add(before);
    const fields = changedFields(before, u);
    if (fields.length === 0) diff.same.push(before);
    else diff.changed.push({ before, after: updated(before, u), fields });
  }
  diff.missing = current.filter((c) => !matched.has(c));
  return diff;
}

/**
 * The new course list. "merge" (add new and update changed) keeps every course on the
 * record, updated in place, with new courses at the end. "replace" is the uploaded list
 * itself; only that explicit choice removes courses.
 */
export function applyMerge(
  current: RecordCourse[],
  uploaded: RecordCourse[],
  mode: MergeMode,
): RecordCourse[] {
  if (mode === "replace") return dedupe(uploaded);
  const diff = diffRecord(current, uploaded);
  const replacement = new Map(diff.changed.map((c) => [c.before, c.after]));
  return [...current.map((c) => replacement.get(c) ?? c), ...diff.added];
}
