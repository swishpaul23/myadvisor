/**
 * build-data.ts. Run with `npm run data:build` (optionally `-- <path to requirements csv>`).
 *
 * Implemented:
 * - Validate data/sheets/requirements.csv (src/lib/data/schema.ts), print counts and
 *   unknown filter terms -> data/generated/requirements.json.
 * - From data/raw/outlines/ (_manifest.json + stripped outlines):
 *   courses.json (one record per course, designations mapped by scripts/lib/designations.ts),
 *   offerings.json (section types per term; future terms kept apart), and
 *   unknown-courses.json (requirements.csv courses with no outline: "offering unknown").
 * - Cross-check: every requirements.csv course is in courses.json or unknown-courses.json.
 * - prereqs.json: prerequisite/corequisite text parsed by scripts/lib/prereqs/ (anything
 *   unclear kept verbatim as unknown nodes); prereqs-review.json lists partial/unparsed
 *   courses. Reports status counts, common unknown fragments, and prerequisite codes we
 *   have no course data for.
 * Any error exits 1 and writes nothing.
 *
 * Still to come:
 * - Read the other CSVs and data/policy/sfu.json.
 * - Report rows with "unsure" in notes.
 * - Upsert the reference tables into Postgres when DATABASE_URL is set.
 * Running it twice must give the same result.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  coursesFileSchema,
  offeringsFileSchema,
  unknownCoursesFileSchema,
  type Course,
} from "@/lib/data/catalog";
import {
  buildCourse,
  buildOfferings,
  findUnknownCourses,
  termKey,
  type ManifestCourse,
} from "./lib/catalog";
import { prereqsFileSchema } from "@/lib/data/prereqs";
import { courseReferencesFromRequirementsCsv } from "./lib/outlines/requirements";
import { parsePrerequisites } from "./lib/prereqs";
import { codesWithoutData, topFragments } from "./lib/prereqs/report";
import { validateRequirementsCsv } from "./validate-requirements";

const REQUIREMENTS_CSV = "data/sheets/requirements.csv";
const OUTLINES_DIR = "data/raw/outlines";
const OUT = {
  requirements: "data/generated/requirements.json",
  courses: "data/generated/courses.json",
  offerings: "data/generated/offerings.json",
  unknown: "data/generated/unknown-courses.json",
  prereqs: "data/generated/prereqs.json",
  prereqsReview: "data/generated/prereqs-review.json",
};

type Manifest = {
  terms: { term: string; future: boolean }[];
  courses: Record<string, ManifestCourse>;
  requirement_codes_without_data: string[];
};

function printCounts(title: string, counts: Record<string, number>) {
  console.log(`\n${title}:`);
  for (const [key, n] of Object.entries(counts).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`  ${String(n).padStart(4)}  ${key}`);
  }
}

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8"));
const errors: string[] = [];

// ---------- requirements ----------

const csvPath = process.argv[2] ?? REQUIREMENTS_CSV;
const csvText = readFileSync(csvPath, "utf8");
const requirements = validateRequirementsCsv(csvText);
errors.push(...requirements.errors);
const total = Object.values(requirements.counts.status).reduce(
  (a, b) => a + b,
  0,
);

console.log(`requirements: ${csvPath} (${total} rows)`);
printCounts("By status", requirements.counts.status);
printCounts("By group", requirements.counts.group);
printCounts("By concentration", requirements.counts.concentration);

const rowsByTerm = new Map<string, string[]>();
for (const { sheetRow, reqId, term } of requirements.unknownFilterTerms) {
  const rows = rowsByTerm.get(term) ?? [];
  rows.push(`${reqId} (sheet row ${sheetRow})`);
  rowsByTerm.set(term, rows);
}
console.log(
  `\nFilter terms not in the allowed list (in-scope rows): ${rowsByTerm.size} distinct, ${requirements.unknownFilterTerms.length} uses`,
);
for (const [term, rows] of rowsByTerm) {
  console.log(`  "${term}"`);
  for (const row of rows) console.log(`      ${row}`);
}

// ---------- courses ----------

const manifest = readJson(join(OUTLINES_DIR, "_manifest.json")) as Manifest;
const courses: Course[] = [];
for (const [code, record] of Object.entries(manifest.courses).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  if (!record.outline) continue;
  let info: Record<string, unknown>;
  try {
    info = (
      readJson(join(OUTLINES_DIR, record.outline)) as {
        info: Record<string, unknown>;
      }
    ).info;
  } catch {
    errors.push(`${code}: outline ${record.outline} is missing or not JSON`);
    continue;
  }
  const sourceTerm = record.outline.split("/").slice(0, 2).join("/");
  const built = buildCourse(code, info, sourceTerm, record.title);
  errors.push(...built.errors);
  if (built.course) courses.push(built.course);
}

const byDept: Record<string, number> = {};
for (const c of courses) byDept[c.department] = (byDept[c.department] ?? 0) + 1;
console.log(
  `\ncourses: ${courses.length} (units missing: ${courses.filter((c) => c.units === null).length})`,
);
printCounts("Courses by department", byDept);

const mapping = new Map<string, { codes: string[]; count: number }>();
for (const c of courses) {
  const key = c.designation_raw ?? "(no designation field)";
  const entry = mapping.get(key) ?? { codes: c.designations, count: 0 };
  entry.count++;
  mapping.set(key, entry);
}
console.log(`\nDesignation mapping (raw -> codes, courses):`);
for (const [raw, { codes, count }] of [...mapping].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  console.log(
    `  ${JSON.stringify(raw).padEnd(40)} -> [${codes.join(", ")}]  x${count}`,
  );
}

// ---------- offerings ----------

const futureTerms = new Set(
  manifest.terms.filter((t) => t.future).map((t) => t.term),
);
const offerings = buildOfferings(manifest.courses, futureTerms);
const confirmedTerms = manifest.terms
  .filter((t) => !t.future)
  .map((t) => termKey(t.term));
console.log(
  `\nofferings: ${Object.keys(offerings).length} courses; confirmed terms ${confirmedTerms.join(", ")}; future ${[...futureTerms].map(termKey).join(", ") || "none"}`,
);

// ---------- unknown courses + cross-check ----------

const termRange = `${confirmedTerms[0]} to ${termKey(manifest.terms.at(-1)?.term ?? "")}`;
const refs = courseReferencesFromRequirementsCsv(csvText);
const { unknown, errors: crossCheckErrors } = findUnknownCourses(
  refs,
  new Set(courses.map((c) => c.code)),
  manifest.requirement_codes_without_data,
  termRange,
);
errors.push(...crossCheckErrors);
const requirementCodes = Object.keys(refs);
console.log(
  `\nrequirements.csv courses: ${requirementCodes.length}; in courses.json: ${requirementCodes.length - unknown.length - crossCheckErrors.length}; offering unknown: ${unknown.length}`,
);
const unknownByDept = new Map<string, string[]>();
for (const u of unknown) {
  const dept = u.code.split(" ")[0] ?? "";
  unknownByDept.set(dept, [...(unknownByDept.get(dept) ?? []), u.code]);
}
for (const [dept, codes] of unknownByDept) {
  console.log(
    `  ${dept.padEnd(5)} ${codes.map((c) => c.split(" ")[1]).join(", ")}`,
  );
}

// ---------- prerequisites ----------

const prereqs = courses.map((c) =>
  parsePrerequisites(c.code, c.prerequisites_text, c.corequisites_text),
);
const prereqCounts: Record<string, number> = {};
for (const r of prereqs)
  prereqCounts[r.status] = (prereqCounts[r.status] ?? 0) + 1;
printCounts("Prerequisites by status", prereqCounts);

const top = topFragments(prereqs, 20);
const byPattern = new Map<string, typeof top>();
for (const f of top)
  byPattern.set(f.pattern, [...(byPattern.get(f.pattern) ?? []), f]);
console.log(`\n20 most common unknown fragments, by pattern:`);
for (const [pattern, fragments] of byPattern) {
  console.log(`  ${pattern}:`);
  for (const f of fragments)
    console.log(
      `    ${String(f.count).padStart(3)}  ${JSON.stringify(f.text)}`,
    );
}

// Cross-check (report only): codes in parsed nodes that we have no data for.
const knownCodes = new Set([
  ...courses.map((c) => c.code),
  ...unknown.map((u) => u.code),
]);
const missingCodes = codesWithoutData(prereqs, knownCodes);
console.log(
  `\nPrerequisite course codes not in courses.json or unknown-courses.json: ${Object.keys(missingCodes).length}`,
);
for (const [code, citedBy] of Object.entries(missingCodes)) {
  console.log(`  ${code.padEnd(10)} cited by ${citedBy.join(", ")}`);
}

const review = prereqs
  .filter((r) => r.status === "partial" || r.status === "unparsed")
  .map(({ code, status, raw, raw_coreq, unparsed_fragments }) => ({
    code,
    status,
    raw,
    raw_coreq,
    unparsed_fragments,
  }));

// ---------- validate and write ----------

for (const [name, schema, value] of [
  ["courses.json", coursesFileSchema, courses],
  ["offerings.json", offeringsFileSchema, offerings],
  ["unknown-courses.json", unknownCoursesFileSchema, unknown],
  ["prereqs.json", prereqsFileSchema, prereqs],
] as const) {
  const result = schema.safeParse(value);
  if (!result.success) {
    errors.push(
      `${name}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
}

if (errors.length > 0) {
  console.error(`\nFAILED: ${errors.length} error(s). Nothing written.`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

const write = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
};
write(OUT.requirements, { source: csvPath, requirements: requirements.rows });
write(OUT.courses, courses);
write(OUT.offerings, offerings);
write(OUT.unknown, unknown);
write(OUT.prereqs, prereqs);
write(OUT.prereqsReview, review);
console.log(
  `\nOK: wrote ${requirements.rows.length} requirements, ${courses.length} courses, ${Object.keys(offerings).length} offerings, ${unknown.length} unknown courses, ${prereqs.length} prerequisite records (${review.length} to review) to data/generated/`,
);
