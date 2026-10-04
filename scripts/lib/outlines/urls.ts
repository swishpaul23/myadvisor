import type { Term } from "./terms";

// Course Outlines API: the path goes in the query string, e.g. ?2026/fall/bus/312/d100.
// Each part must be given only if every part before it is. See docs/outlines-api.md.
export type ApiPath = {
  year?: number | "current";
  term?: Term["term"] | "current";
  dept?: string;
  number?: string;
  section?: string;
};

export function apiUrl(baseUrl: string, path: ApiPath = {}): string {
  const parts = [path.year, path.term, path.dept, path.number, path.section];
  const firstMissing = parts.findIndex((p) => p === undefined);
  const given = firstMissing === -1 ? parts : parts.slice(0, firstMissing);
  if (parts.slice(given.length).some((p) => p !== undefined)) {
    throw new Error(`API path has a gap: ${JSON.stringify(path)}`);
  }
  if (given.length === 0) return baseUrl;
  return `${baseUrl}?${given.map((p) => String(p).trim().toLowerCase()).join("/")}`;
}
