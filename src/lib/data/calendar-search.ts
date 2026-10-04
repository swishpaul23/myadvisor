import type { Course } from "./catalog";
import type { RequirementRow } from "./schema";

// Plain-text calendar search, shared by the Snowflake and JSON data sources. No Cortex
// Search or embeddings: course codes are matched exactly, then by text (ILIKE), and a
// question without a code falls back to its longest keywords.

export type CalendarHit = {
  text: string;
  course_code: string | null;
  source_url: string;
};

/** A searchable chunk, as in the Snowflake table myadvisor.app.calendar_chunks. */
export type CalendarChunk = CalendarHit & {
  section_type: "course" | "requirement";
};

export const SEARCH_LIMIT = 5;
const MAX_KEYWORDS = 3;

// Words that are never searched for: question words, and words found in nearly every chunk.
const STOPWORDS = new Set([
  "about", "after", "also", "before", "could", "course", "courses", "does", "from", "give",
  "have", "help", "into", "just", "know", "like", "many", "more", "most", "much", "need",
  "only", "please", "should", "show", "some", "still", "take", "taking", "tell", "than",
  "that", "their", "them", "then", "there", "these", "they", "this", "those", "unit",
  "units", "want", "what", "when", "where", "which", "will", "with", "would", "your",
  "prereq", "prereqs", "prerequisite", "prerequisites", "corequisite", "corequisites",
]); // prettier-ignore

const CODE_PATTERN = /\b([A-Za-z]{2,5})\s*(\d{3}[A-Za-z]?)\b/g;

/** Course codes in a question, normalised to "BUS 360W", in order, without repeats. */
export function extractCourseCodes(query: string): string[] {
  const codes: string[] = [];
  for (const [, dept, number] of query.matchAll(CODE_PATTERN)) {
    if (STOPWORDS.has(dept!.toLowerCase())) continue; // "take 300 units" is not a course
    const code = `${dept!.toUpperCase()} ${number!.toUpperCase()}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** Up to three of the longest non-stopwords (4+ letters or digits), lower case. */
export function extractKeywords(query: string): string[] {
  const withoutCodes = query.replace(CODE_PATTERN, " ");
  const words = withoutCodes.toLowerCase().split(/[^a-z0-9]+/);
  const unique = [...new Set(words)].filter(
    (w) => w.length >= 4 && !STOPWORDS.has(w),
  );
  return unique
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, MAX_KEYWORDS);
}

// Snowflake's NUMBER(3,1)::STRING gives "3.0"; the JSON chunks match that text.
const decimal = (n: number | null) => (n === null ? null : n.toFixed(1));

/**
 * Builds the same chunks as build-search.mjs builds in Snowflake: one per course and one
 * per requirement row, each with a source_url for citations.
 */
export function buildCalendarChunks(
  courses: readonly Course[],
  requirements: readonly RequirementRow[],
): CalendarChunk[] {
  const courseChunks = courses.map((c): CalendarChunk => {
    const [year, season] = c.source_term.split("-");
    const [dept, number] = c.code.toLowerCase().split(" ");
    return {
      section_type: "course",
      course_code: c.code,
      text:
        `${c.code} ${c.title ?? ""} (${decimal(c.units) ?? "?"} units). ${c.description ?? ""}` +
        ` Prerequisites: ${c.prerequisites_text || "none"}` +
        (c.corequisites_text ? ` Corequisites: ${c.corequisites_text}` : ""),
      source_url: `https://www.sfu.ca/students/calendar/${year}/${season}/courses/${dept}/${number}.html`,
    };
  });
  const requirementChunks = requirements.map((r): CalendarChunk => ({
    section_type: "requirement",
    course_code: null,
    text:
      `${r.program} ${r.concentration ?? ""} / ${r.group}: ${r.rule} ${decimal(r.n_or_units) ?? ""}` +
      (r.courses.length > 0 ? ` Courses: ${r.courses.join(", ")}` : "") +
      ` Notes: ${r.notes}`,
    source_url: r.source_url,
  }));
  return [...courseChunks, ...requirementChunks];
}

const byCodeThenText = (a: CalendarChunk, b: CalendarChunk) =>
  (a.course_code === null ? 1 : 0) - (b.course_code === null ? 1 : 0) ||
  (a.course_code ?? "").localeCompare(b.course_code ?? "") ||
  a.text.localeCompare(b.text);

const hit = ({
  text,
  course_code,
  source_url,
}: CalendarChunk): CalendarHit => ({
  text,
  course_code,
  source_url,
});

/** Chunks naming any of the codes: exact course_code matches first, then text matches. */
export function searchChunksByCode(
  chunks: readonly CalendarChunk[],
  codes: readonly string[],
): CalendarHit[] {
  const exact = (c: CalendarChunk) =>
    c.course_code !== null && codes.includes(c.course_code);
  const mentions = (c: CalendarChunk) => {
    const text = c.text.toLowerCase();
    return codes.some((code) => text.includes(code.toLowerCase()));
  };
  return chunks
    .filter((c) => exact(c) || mentions(c))
    .sort(
      (a, b) => (exact(a) ? 0 : 1) - (exact(b) ? 0 : 1) || byCodeThenText(a, b),
    )
    .slice(0, SEARCH_LIMIT)
    .map(hit);
}

/** Chunks containing any keyword, most keywords matched first. */
export function searchChunksByKeywords(
  chunks: readonly CalendarChunk[],
  keywords: readonly string[],
): CalendarHit[] {
  const score = (c: CalendarChunk) => {
    const text = c.text.toLowerCase();
    return keywords.filter((k) => text.includes(k)).length;
  };
  return chunks
    .map((c) => ({ c, s: score(c) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s || byCodeThenText(a.c, b.c))
    .slice(0, SEARCH_LIMIT)
    .map(({ c }) => hit(c));
}

/** The whole search over in-memory chunks (used by the JSON source). */
export function searchChunks(
  chunks: readonly CalendarChunk[],
  query: string,
): CalendarHit[] {
  const codes = extractCourseCodes(query);
  if (codes.length > 0) {
    const hits = searchChunksByCode(chunks, codes);
    if (hits.length > 0) return hits;
  }
  return searchChunksByKeywords(chunks, extractKeywords(query));
}
