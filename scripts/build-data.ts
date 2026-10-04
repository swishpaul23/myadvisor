/**
 * build-data.ts. Run with `npm run data:build` (optionally `-- <path to requirements csv>`).
 *
 * Implemented: validate data/sheets/requirements.csv against the schema in
 * src/lib/data/schema.ts, print counts and unknown filter terms, and write
 * data/generated/requirements.json. Exits 1 without writing if any row is invalid.
 *
 * Still to come:
 * - Read the other CSVs, data/raw/outlines/, and data/policy/sfu.json.
 * - Check every course code in a requirement exists in the outlines.
 * - Report rows with "unsure" in notes.
 * - Upsert the reference tables into Postgres when DATABASE_URL is set.
 * Running it twice must give the same result.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateRequirementsCsv } from "./validate-requirements";

const REQUIREMENTS_CSV = "data/sheets/requirements.csv";
const REQUIREMENTS_JSON = "data/generated/requirements.json";

function printCounts(title: string, counts: Record<string, number>) {
  console.log(`\n${title}:`);
  for (const [key, n] of Object.entries(counts).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`  ${String(n).padStart(4)}  ${key}`);
  }
}

const csvPath = process.argv[2] ?? REQUIREMENTS_CSV;
const { rows, errors, unknownFilterTerms, counts } = validateRequirementsCsv(
  readFileSync(csvPath, "utf8"),
);
const total = Object.values(counts.status).reduce((a, b) => a + b, 0);

console.log(`requirements: ${csvPath} (${total} rows)`);
printCounts("By status", counts.status);
printCounts("By group", counts.group);
printCounts("By concentration", counts.concentration);

console.log(
  `\nFilter terms not in the allowed list: ${unknownFilterTerms.length}`,
);
for (const { sheetRow, reqId, term } of unknownFilterTerms) {
  console.log(`  sheet row ${sheetRow} (req_id ${reqId}): ${term}`);
}

if (errors.length > 0) {
  console.error(
    `\nFAILED: ${errors.length} error(s). ${REQUIREMENTS_JSON} not written.`,
  );
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

mkdirSync(dirname(REQUIREMENTS_JSON), { recursive: true });
writeFileSync(
  REQUIREMENTS_JSON,
  JSON.stringify({ source: csvPath, requirements: rows }, null, 2) + "\n",
);
console.log(`\nOK: wrote ${rows.length} requirements to ${REQUIREMENTS_JSON}`);
