import Papa from "papaparse";

const COURSE_CODE = /^[A-Z]{2,5} \d{3}[A-Z]?$/;
const EXCLUDE_TERM = /^exclude (.+)$/;

/**
 * Every course code named in requirements.csv: the `courses` column plus codes in
 * `exclude CODE|CODE` filter terms. Out-of-scope rows are skipped; from_reqs rows have
 * no courses of their own, so they add nothing. Returns sorted, unique codes like "BUS 217W".
 */
export function courseCodesFromRequirementsCsv(csvText: string): string[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const codes = new Set<string>();
  for (const row of data) {
    if ((row.status ?? "").trim() === "out-of-scope") continue;

    for (const code of (row.courses ?? "").split(",")) {
      const trimmed = code.trim().toUpperCase();
      if (COURSE_CODE.test(trimmed)) codes.add(trimmed);
    }

    for (const term of (row.filter ?? "").split(";")) {
      const match = EXCLUDE_TERM.exec(term.trim());
      for (const code of match?.[1]?.split("|") ?? []) {
        const trimmed = code.trim().toUpperCase();
        if (COURSE_CODE.test(trimmed)) codes.add(trimmed);
      }
    }
  }
  return [...codes].sort();
}
