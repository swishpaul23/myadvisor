import { SEASONS } from "./types";

// Term ids look like "2027-spring". Seasons: spring (Jan-Apr), summer (May-Aug), fall
// (Sep-Dec).

type Season = (typeof SEASONS)[number];

const parse = (id: string) => {
  const [year, season] = id.split("-") as [string, Season];
  return { year: Number(year), season };
};

/** "2027-spring" -> "Spring 2027". */
export function termLabel(id: string): string {
  const { year, season } = parse(id);
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

/** Sortable index: 2027-spring < 2027-summer < 2027-fall < 2028-spring. */
export function termIndex(id: string): number {
  const { year, season } = parse(id);
  return year * 3 + SEASONS.indexOf(season);
}

function fromIndex(index: number): string {
  return `${Math.floor(index / 3)}-${SEASONS[index % 3]}`;
}

/** The term a date falls in. */
export function termOf(date: Date): string {
  const month = date.getMonth(); // 0-11
  const season: Season = month < 4 ? "spring" : month < 8 ? "summer" : "fall";
  return `${date.getFullYear()}-${season}`;
}

/** The `count` terms after `from`, in order. */
export function termsAfter(from: string, count: number): string[] {
  const start = termIndex(from);
  return Array.from({ length: count }, (_, i) => fromIndex(start + 1 + i));
}

/** Terms from `from` back `count` terms (newest first), including `from`. */
export function termsUpTo(from: string, count: number): string[] {
  const end = termIndex(from);
  return Array.from({ length: count }, (_, i) => fromIndex(end - i));
}

/** Admission years a student can pick: this year back twelve years, newest first. */
export function admissionYearOptions(today: Date): number[] {
  const year = today.getFullYear();
  return Array.from({ length: 13 }, (_, i) => year - i);
}

/** "spring" -> "Spring". */
export const seasonLabel = (season: string) =>
  `${season.charAt(0).toUpperCase()}${season.slice(1)}`;

/** Terms a student can plan: the next six after the current one. */
export function planTermOptions(today: Date): string[] {
  return termsAfter(termOf(today), 6);
}

/** Terms a student can pick as co-op work terms: the next twelve after the current one. */
export function coopTermOptions(today: Date): string[] {
  return termsAfter(termOf(today), 12);
}

/** Terms a course on the record can be from: twelve years back to now. */
export function recordTermOptions(today: Date): string[] {
  return termsUpTo(termOf(today), 36);
}
