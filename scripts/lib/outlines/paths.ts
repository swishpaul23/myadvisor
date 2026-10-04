import type { Term } from "./terms";

// File layout under data/raw/outlines/. Departments and course numbers are lowercase,
// as the API returns them (e.g. bus/217w).
export const MANIFEST_FILE = "_manifest.json";

function termDir(t: Term, dept: string): string {
  return `${t.year}/${t.term}/${dept.toLowerCase()}`;
}

export function coursesListPath(t: Term, dept: string): string {
  return `${termDir(t, dept)}/_courses.json`;
}

export function sectionsPath(t: Term, dept: string, number: string): string {
  return `${termDir(t, dept)}/${number.toLowerCase()}.sections.json`;
}

export function outlinePath(t: Term, dept: string, number: string): string {
  return `${termDir(t, dept)}/${number.toLowerCase()}.outline.json`;
}
