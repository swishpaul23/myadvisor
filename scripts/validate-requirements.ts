import Papa from "papaparse";
import {
  REQUIREMENTS_COLUMNS,
  findUnknownFilterTerms,
  fromReqsIds,
  withinIds,
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
  const fromReqsRefs: { where: string; id: string }[] = [];
  const withinRefs: { where: string; id: string }[] = [];

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

    // Out-of-scope rows are skipped by the engine, so their filters are not checked.
    if (raw.status.trim() !== "out-of-scope") {
      const terms = splitFilterTerms(raw.filter);
      for (const term of findUnknownFilterTerms(terms)) {
        unknownFilterTerms.push({ sheetRow, reqId, term });
      }
      for (const id of fromReqsIds(terms)) {
        fromReqsRefs.push({ where, id });
      }
      const within = withinIds(terms);
      if (within.length > 1) {
        errors.push(`${where}: filter: more than one within term`);
      }
      for (const id of within) {
        if (id === reqId)
          errors.push(`${where}: filter: within names the row itself`);
        else withinRefs.push({ where, id });
      }
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

  // Checked after the loop so a from_reqs/within term may name a row further down the sheet.
  for (const { where, id } of fromReqsRefs) {
    if (!firstRowOfId.has(id)) {
      errors.push(`${where}: filter: from_reqs names unknown req_id "${id}"`);
    }
  }
  for (const { where, id } of withinRefs) {
    if (!firstRowOfId.has(id)) {
      errors.push(`${where}: filter: within names unknown req_id "${id}"`);
    }
  }

  return { rows, errors, unknownFilterTerms, counts };
}
