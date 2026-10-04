import Papa from "papaparse";

const COURSE_CODE = /^[A-Z]{2,5} \d{3}[A-Z]?$/;
const EXCLUDE_TERM = /^exclude (.+)$/;

/**
 * Every course code named in requirements.csv, with the req_ids of the rows naming it:
 * the `courses` column plus codes in `exclude CODE|CODE` filter terms. Out-of-scope rows
 * are skipped; from_reqs rows have no courses of their own, so they add nothing.
 * Keys are sorted codes like "BUS 217W"; req_ids keep sheet order.
 */
export function courseReferencesFromRequirementsCsv(
  csvText: string,
): Record<string, string[]> {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const refs = new Map<string, string[]>();
  const add = (code: string, reqId: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!COURSE_CODE.test(trimmed)) return;
    const ids = refs.get(trimmed) ?? [];
    if (!ids.includes(reqId)) ids.push(reqId);
    refs.set(trimmed, ids);
  };

  for (const row of data) {
    if ((row.status ?? "").trim() === "out-of-scope") continue;
    const reqId = (row.req_id ?? "").trim();

    for (const code of (row.courses ?? "").split(",")) add(code, reqId);

    for (const term of (row.filter ?? "").split(";")) {
      const match = EXCLUDE_TERM.exec(term.trim());
      for (const code of match?.[1]?.split("|") ?? []) add(code, reqId);
    }
  }
  return Object.fromEntries([...refs].sort(([a], [b]) => a.localeCompare(b)));
}

/** Sorted, unique course codes named in requirements.csv (see above). */
export function courseCodesFromRequirementsCsv(csvText: string): string[] {
  return Object.keys(courseReferencesFromRequirementsCsv(csvText));
}
