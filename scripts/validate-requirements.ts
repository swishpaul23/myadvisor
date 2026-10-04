import Papa from "papaparse";
import {
  REQUIREMENTS_COLUMNS,
  findUnknownFilterTerms,
  requirementRowSchema,
  splitFilterTerms,
  type RequirementRow,
} from "@/lib/data/schema";

// Pure validation of requirements.csv text. build-data.ts does the file I/O.
// "Sheet row" is the row number in the Google Sheet: the header is row 1.

export type UnknownFilterTerm = {
  sheetRow: number;
  reqId: string;
  term: string;
};

export type RequirementsValidation = {
  rows: RequirementRow[];
  errors: string[];
  unknownFilterTerms: UnknownFilterTerm[];
  counts: {
    status: Record<string, number>;
    group: Record<string, number>;
    concentration: Record<string, number>;
  };
};

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function validateRequirementsCsv(
  csvText: string,
): RequirementsValidation {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];
  const rows: RequirementRow[] = [];
  const unknownFilterTerms: UnknownFilterTerm[] = [];
  const counts = { status: {}, group: {}, concentration: {} };

  const fields = parsed.meta.fields ?? [];
  const missing = REQUIREMENTS_COLUMNS.filter((c) => !fields.includes(c));
  const unexpected = fields.filter(
    (f) => !(REQUIREMENTS_COLUMNS as readonly string[]).includes(f),
  );
  if (missing.length > 0)
    errors.push(`header: missing columns ${missing.join(", ")}`);
  if (unexpected.length > 0) {
    errors.push(`header: unexpected columns ${unexpected.join(", ")}`);
  }

  for (const e of parsed.errors) {
    const where = e.row === undefined ? "file" : `sheet row ${e.row + 2}`;
    errors.push(`${where}: CSV ${e.code}: ${e.message}`);
  }

  const firstRowOfId = new Map<string, number>();

  parsed.data.forEach((record, index) => {
    const sheetRow = index + 2;
    // Treat missing columns as blank so each row reports value errors, not the header again.
    const raw = Object.fromEntries(
      REQUIREMENTS_COLUMNS.map((c) => [c, record[c] ?? ""]),
    ) as Record<(typeof REQUIREMENTS_COLUMNS)[number], string>;
    const reqId = raw.req_id.trim() || "(blank)";
    const where = `sheet row ${sheetRow} (req_id ${reqId})`;

    increment(counts.status, raw.status.trim() || "(blank)");
    increment(counts.group, raw.group.trim() || "(blank)");
    increment(counts.concentration, raw.concentration.trim() || "(all)");

    for (const term of findUnknownFilterTerms(splitFilterTerms(raw.filter))) {
      unknownFilterTerms.push({ sheetRow, reqId, term });
    }

    const firstRow = firstRowOfId.get(reqId);
    if (firstRow !== undefined) {
      errors.push(
        `${where}: duplicate req_id, first used on sheet row ${firstRow}`,
      );
    } else {
      firstRowOfId.set(reqId, sheetRow);
    }

    const result = requirementRowSchema.safeParse(raw);
    if (result.success) {
      rows.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        const column = issue.path.join(".") || "row";
        errors.push(`${where}: ${column}: ${issue.message}`);
      }
    }
  });

  return { rows, errors, unknownFilterTerms, counts };
}
