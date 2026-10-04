import Papa from "papaparse";
import {
  PREREQ_OVERRIDE_COLUMNS,
  prereqOverrideRowSchema,
  type PrereqOverride,
  type PrereqRecord,
} from "@/lib/data/prereqs";
import { statusOf } from "./index";

// data/sheets/prereq-overrides.csv: a person writes the prerequisite tree for a course
// the parser can't handle. `override_json` is a PrereqNode (or `null` for no prerequisite)
// in the same format as prereqs.json. "Sheet row" is the spreadsheet row (header = 1).

export function parseOverridesCsv(csvText: string): {
  rows: PrereqOverride[];
  errors: string[];
} {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const errors: string[] = [];
  const rows: PrereqOverride[] = [];

  const fields = parsed.meta.fields ?? [];
  const missing = PREREQ_OVERRIDE_COLUMNS.filter((c) => !fields.includes(c));
  const unexpected = fields.filter(
    (f) => !(PREREQ_OVERRIDE_COLUMNS as readonly string[]).includes(f),
  );
  if (missing.length > 0)
    errors.push(`header: missing columns ${missing.join(", ")}`);
  if (unexpected.length > 0)
    errors.push(`header: unexpected columns ${unexpected.join(", ")}`);
  for (const e of parsed.errors) {
    const where = e.row === undefined ? "file" : `sheet row ${e.row + 2}`;
    errors.push(`${where}: CSV ${e.code}: ${e.message}`);
  }

  const seen = new Map<string, number>();
  parsed.data.forEach((record, index) => {
    const sheetRow = index + 2;
    const code = (record.course_code ?? "").trim();
    const where = `prereq-overrides.csv sheet row ${sheetRow} (${code || "no course_code"})`;

    const first = seen.get(code);
    if (first !== undefined) {
      errors.push(
        `${where}: duplicate course_code, first on sheet row ${first}`,
      );
      return;
    }
    seen.set(code, sheetRow);

    const jsonText = (record.override_json ?? "").trim();
    if (jsonText === "") {
      errors.push(
        `${where}: override_json is empty (write null for "no prerequisite")`,
      );
      return;
    }
    let tree: unknown;
    try {
      tree = JSON.parse(jsonText);
    } catch (e) {
      errors.push(
        `${where}: override_json is not valid JSON (${(e as Error).message})`,
      );
      return;
    }

    const result = prereqOverrideRowSchema.safeParse({
      ...record,
      course_code: code,
      override_json: tree,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(
          `${where}: ${issue.path.join(".") || "row"}: ${issue.message}`,
        );
      }
      return;
    }
    rows.push(result.data);
  });

  return { rows, errors };
}

/**
 * Replaces each overridden course's `prereq` with the override tree and marks it
 * source "override" (corequisites and raw text stay as parsed). An override for a course
 * that isn't in courses.json is an error.
 */
export function applyOverrides(
  records: PrereqRecord[],
  overrides: PrereqOverride[],
  courseCodes: ReadonlySet<string>,
): { records: PrereqRecord[]; errors: string[] } {
  const errors: string[] = [];
  const byCode = new Map<string, PrereqOverride>();
  for (const o of overrides) {
    if (!courseCodes.has(o.course_code)) {
      errors.push(
        `prereq-overrides.csv: ${o.course_code} is not in courses.json`,
      );
      continue;
    }
    byCode.set(o.course_code, o);
  }

  const out = records.map((record) => {
    const o = byCode.get(record.code);
    if (!o) return record;
    const prereq = o.override_json;
    return {
      ...record,
      prereq,
      ...statusOf(prereq, record.coreq),
      source: "override" as const,
    };
  });
  return { records: out, errors };
}
