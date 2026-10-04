/**
 * fetch-outlines.ts. Run with `npm run data:fetch -- [flags]`.
 *
 * Saves SFU Course Outlines API data to data/raw/outlines/ (layout in that folder's
 * README and docs/outlines-api.md). Raw capture only: no prerequisite parsing.
 *
 * Flags:
 *   --dry-run                 fetch only robots.txt and list levels; print request count and time
 *   --refresh                 re-fetch files that already exist
 *   --depts BUS,ECON          fetch these departments whole instead of the config defaults
 *   --depts +CMPT,+GEOG       fetch these whole in addition to the defaults
 *   --no-from-requirements    don't add the course codes listed in data/sheets/requirements.csv
 *   --terms 2026/fall,...     these terms instead of the last six ending at the config endTerm
 *
 * Rules: 1 request/second; User-Agent carries CONTACT_EMAIL from .env.local (refuses to run
 * without it); refuses if robots.txt disallows the API path; writes files atomically.
 * Helpers live in scripts/lib/outlines/.
 */
import { config as loadEnv } from "dotenv";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import settings from "./outlines.config.json";
import { createClient, TooManyFailuresError } from "./lib/outlines/client";
import {
  courseCode,
  isUndergraduate,
  outlineSectionCandidates,
  parseCourses,
  parseDepartments,
  parseOutline,
  parseSections,
  parseTerms,
  parseYears,
  splitCourseCode,
  type SectionListItem,
} from "./lib/outlines/parse";
import {
  coursesListPath,
  MANIFEST_FILE,
  outlinePath,
  sectionsPath,
} from "./lib/outlines/paths";
import { courseCodesFromRequirementsCsv } from "./lib/outlines/requirements";
import { isPathAllowed } from "./lib/outlines/robots";
import { stripOutline } from "./lib/outlines/strip";
import {
  compareTerms,
  lastTerms,
  parseTerm,
  TERM_NAMES,
  termKey,
  type Term,
} from "./lib/outlines/terms";
import { apiUrl } from "./lib/outlines/urls";

const OUT_DIR = "data/raw/outlines";
const REQUIREMENTS_CSV = "data/sheets/requirements.csv";

type ScopedTerm = { term: Term; future: boolean };
type Entry = {
  /** Date files for this term/department were last written (kept across resumed runs). */
  fetched_at: string;
  future: boolean;
  courses_found: number;
  /** JSON files in this term/department folder after the run. */
  files_on_disk: number;
  /** Written and skipped by the most recent run only. */
  files_written: number;
  files_skipped: number;
  not_offered: string[];
  failures: string[];
};
type CourseRecord = {
  /** From the course lists; null if no list gave one (the outline has info.title). */
  title: string | null;
  ran: string[];
  outline: string | null;
};
type Manifest = {
  generated_by: string;
  terms: { term: string; future: boolean }[];
  entries: Record<string, Entry>;
  courses: Record<string, CourseRecord>;
  requirement_codes_without_data: string[];
  unexpected_outline_fields: string[];
};

// ---------- file helpers ----------

const outFile = (rel: string) => join(OUT_DIR, rel);
const exists = (rel: string) => existsSync(outFile(rel));
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(outFile(rel), "utf8"));

function writeAtomic(rel: string, value: unknown) {
  const full = outFile(rel);
  mkdirSync(dirname(full), { recursive: true });
  const tmp = `${full}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, full);
}

function sortedObject<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
}

// ---------- arguments ----------

function readArgs() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      refresh: { type: "boolean", default: false },
      "from-requirements": { type: "boolean", default: true },
      depts: { type: "string" },
      terms: { type: "string" },
    },
    allowNegative: true,
    strict: true,
  });

  const defaults = settings.departments.map((d) => d.toLowerCase());
  let wholeDepts = defaults;
  if (values.depts) {
    const items = values.depts
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const adding = items.filter((d) => d.startsWith("+"));
    if (adding.length > 0 && adding.length !== items.length) {
      throw new Error(
        "--depts: either all entries start with + (add) or none do (override)",
      );
    }
    const named = items.map((d) => d.replace(/^\+/, "").toLowerCase());
    wholeDepts =
      adding.length > 0 ? [...new Set([...defaults, ...named])] : named;
  }

  return {
    dryRun: values["dry-run"],
    refresh: values.refresh,
    fromRequirements: values["from-requirements"],
    wholeDepts,
    terms: values.terms?.split(",").map((t) => parseTerm(t)),
  };
}

// ---------- main ----------

async function main() {
  const args = readArgs();
  const env = loadEnv({ path: ".env.local", quiet: true });
  const contact = process.env.CONTACT_EMAIL?.trim();
  if (!contact) {
    // Say why without printing the file's contents.
    const reason = env.error
      ? `.env.local could not be read (${(env.error as NodeJS.ErrnoException).code ?? env.error.message})`
      : `.env.local has ${env.parsed && "CONTACT_EMAIL" in env.parsed ? "an empty CONTACT_EMAIL" : "no CONTACT_EMAIL line"}`;
    console.error(
      `CONTACT_EMAIL is not set: ${reason}. Refusing to run: SFU must be able to contact us.`,
    );
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    console.error(
      "CONTACT_EMAIL in .env.local does not look like an email address. Refusing to run.",
    );
    process.exit(1);
  }
  const userAgent = `myAdvisor-hackathon (contact: ${contact})`;
  const client = createClient({
    userAgent,
    intervalMs: settings.requestIntervalMs,
  });
  const endTerm = parseTerm(settings.endTerm);

  // robots.txt first: refuse if the API path is disallowed.
  const robots = await client.getRaw(settings.robotsUrl);
  const apiPathname = new URL(settings.baseUrl).pathname;
  if (!isPathAllowed(robots, userAgent, apiPathname)) {
    console.error(`robots.txt disallows ${apiPathname}. Refusing to run.`);
    process.exit(1);
  }
  console.log(
    `robots.txt allows ${apiPathname}. Mode: ${args.dryRun ? "dry run" : "fetch"}.`,
  );

  // ---- terms ----
  const terms: ScopedTerm[] = [];
  if (args.terms) {
    for (const t of args.terms)
      terms.push({ term: t, future: compareTerms(t, endTerm) > 0 });
  } else {
    for (const t of lastTerms(endTerm, settings.termCount))
      terms.push({ term: t, future: false });
    const years = await client.getJson(apiUrl(settings.baseUrl));
    if (years.status !== "ok")
      throw new Error("Could not fetch the years list");
    for (const { value } of parseYears(years.json)) {
      const year = Number(value);
      if (!(year >= endTerm.year)) continue;
      const termList = await client.getJson(apiUrl(settings.baseUrl, { year }));
      if (termList.status !== "ok") continue;
      const later = parseTerms(termList.json)
        .map((t) => t.value)
        .filter((t): t is Term["term"] =>
          (TERM_NAMES as readonly string[]).includes(t),
        )
        .map((term) => ({ year, term }))
        .filter((t) => compareTerms(t, endTerm) > 0)
        .sort(compareTerms);
      for (const t of later) {
        const depts = await client.getJson(apiUrl(settings.baseUrl, t));
        if (depts.status === "ok" && parseDepartments(depts.json).length > 0) {
          terms.push({ term: t, future: true });
        }
      }
    }
  }
  terms.sort((a, b) => compareTerms(a.term, b.term));
  console.log(
    `Terms: ${terms.map((t) => termKey(t.term) + (t.future ? " (future)" : "")).join(", ")}`,
  );

  // ---- scope ----
  const wholeDepts = new Set(args.wholeDepts);
  const requirementCodes = args.fromRequirements
    ? courseCodesFromRequirementsCsv(readFileSync(REQUIREMENTS_CSV, "utf8"))
    : [];
  const listedOnly = new Map<string, Set<string>>();
  for (const code of requirementCodes) {
    const { dept, number } = splitCourseCode(code);
    if (
      wholeDepts.has(dept) ||
      !isUndergraduate(number, settings.maxCourseNumber)
    )
      continue;
    if (!listedOnly.has(dept)) listedOnly.set(dept, new Set());
    listedOnly.get(dept)!.add(number);
  }
  const allDepts = [...wholeDepts, ...[...listedOnly.keys()].sort()];
  console.log(`Whole departments: ${[...wholeDepts].join(", ").toUpperCase()}`);
  if (listedOnly.size > 0) {
    console.log(
      `Listed courses only (from requirements.csv): ${[...listedOnly]
        .map(([d, ns]) => `${d.toUpperCase()} (${ns.size})`)
        .join(", ")}`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const entries: Record<string, Entry> = {};
  const entryFor = (t: ScopedTerm, dept: string) =>
    (entries[`${termKey(t.term)}/${dept}`] ??= {
      fetched_at: today,
      future: t.future,
      courses_found: 0,
      files_on_disk: 0,
      files_written: 0,
      files_skipped: 0,
      not_offered: [],
      failures: [],
    });
  let filesSkipped = 0;

  // ---- 1. course lists ----
  const offered = new Map<string, { number: string }[]>(); // key: term/dept
  // Most recent title seen in any course list. Some entries have none (docs/outlines-api.md).
  const titles = new Map<string, string>();
  for (const t of terms) {
    for (const dept of allDepts) {
      const entry = entryFor(t, dept);
      const rel = coursesListPath(t.term, dept);
      let json: unknown = [];
      if (!args.refresh && exists(rel)) {
        json = readJson(rel);
        entry.files_skipped++;
        filesSkipped++;
      } else {
        const res = await client.getJson(
          apiUrl(settings.baseUrl, { ...t.term, dept }),
        );
        if (res.status === "ok") {
          json = res.json;
          if (!args.dryRun) {
            writeAtomic(rel, json);
            entry.files_written++;
          }
        } else if (res.status === "failed") {
          entry.failures.push(`course list: ${res.reason}`);
          continue;
        }
        // not-found: the department has no courses this term.
      }
      const courses = parseCourses(json)
        .filter((c) => isUndergraduate(c.value, settings.maxCourseNumber))
        .filter(
          (c) => wholeDepts.has(dept) || listedOnly.get(dept)?.has(c.value),
        );
      for (const c of courses) {
        if (c.title !== undefined)
          titles.set(courseCode(dept, c.value), c.title);
      }
      offered.set(
        `${termKey(t.term)}/${dept}`,
        courses.map((c) => ({ number: c.value })),
      );
      entry.courses_found = courses.length;
      console.log(
        `  [${termKey(t.term)} ${dept.toUpperCase()}] ${courses.length} courses`,
      );
    }
  }

  // ---- dry run: count what a full run would request, then stop ----
  if (args.dryRun) {
    let sections = 0;
    const courses = new Map<string, { dept: string; number: string }>();
    for (const t of terms) {
      for (const dept of allDepts) {
        for (const c of offered.get(`${termKey(t.term)}/${dept}`) ?? []) {
          if (args.refresh || !exists(sectionsPath(t.term, dept, c.number)))
            sections++;
          courses.set(courseCode(dept, c.number), { dept, number: c.number });
        }
      }
    }
    let outlines = 0;
    for (const { dept, number } of courses.values()) {
      const has = terms.some((t) => exists(outlinePath(t.term, dept, number)));
      if (args.refresh || !has) outlines++;
    }
    const listRequests = client.stats.requests;
    const total = listRequests + sections + outlines;
    const minutes = (total * settings.requestIntervalMs) / 60000;
    console.log(`\nDRY RUN (nothing written)`);
    console.log(
      `  terms x departments:     ${terms.length} x ${allDepts.length}`,
    );
    console.log(`  distinct courses:        ${courses.size}`);
    console.log(
      `  requests already made:   ${listRequests} (robots.txt, years/terms, course lists)`,
    );
    console.log(`  section-list requests:   ${sections}`);
    console.log(
      `  outline requests (min):  ${outlines} (more if a lecture section 404s)`,
    );
    console.log(`  full run total:          ~${total} requests`);
    console.log(
      `  estimated time:          ~${minutes.toFixed(0)} min at 1 request/second`,
    );
    return;
  }

  // ---- 2. section lists ----
  const ran = new Map<
    string,
    { dept: string; number: string; terms: ScopedTerm[] }
  >();
  const sectionsOf = new Map<string, SectionListItem[]>(); // key: code@term
  const universe = new Map<string, Set<string>>(); // dept -> numbers seen in any term
  for (const [key, courses] of offered) {
    const dept = key.split("/")[2]!;
    if (!universe.has(dept)) universe.set(dept, new Set());
    for (const c of courses) universe.get(dept)!.add(c.number);
  }

  let done = 0;
  const totalSections = [...offered.values()].reduce(
    (n, cs) => n + cs.length,
    0,
  );
  for (const t of terms) {
    for (const dept of allDepts) {
      const entry = entryFor(t, dept);
      const courses = offered.get(`${termKey(t.term)}/${dept}`) ?? [];
      const ranHere = new Set<string>();
      for (const c of courses) {
        const code = courseCode(dept, c.number);
        const rel = sectionsPath(t.term, dept, c.number);
        let json: unknown | undefined;
        if (!args.refresh && exists(rel)) {
          json = readJson(rel);
          entry.files_skipped++;
          filesSkipped++;
        } else {
          const res = await client.getJson(
            apiUrl(settings.baseUrl, { ...t.term, dept, number: c.number }),
          );
          if (res.status === "ok") {
            json = res.json;
            writeAtomic(rel, json);
            entry.files_written++;
          } else if (res.status === "failed") {
            entry.failures.push(`${code} sections: ${res.reason}`);
          }
        }
        if (json !== undefined) {
          ranHere.add(c.number);
          sectionsOf.set(`${code}@${termKey(t.term)}`, parseSections(json));
          if (!ran.has(code))
            ran.set(code, { dept, number: c.number, terms: [] });
          ran.get(code)!.terms.push(t);
        }
        if (++done % 25 === 0)
          console.log(`  sections ${done}/${totalSections}`);
      }
      entry.not_offered = [...(universe.get(dept) ?? [])]
        .filter((n) => !ranHere.has(n))
        .sort();
    }
  }

  // ---- 3. one outline per course ----
  const courseRecords: Record<string, CourseRecord> = {};
  const designations = new Map<string, number>();
  const unexpected = new Set<string>();
  const outlineFailures: string[] = [];
  done = 0;
  for (const [code, course] of [...ran].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const record: CourseRecord = {
      title: titles.get(code) ?? null,
      ran: course.terms.filter((t) => !t.future).map((t) => termKey(t.term)),
      outline: null,
    };
    courseRecords[code] = record;

    const existing = [...terms]
      .reverse()
      .map((t) => outlinePath(t.term, course.dept, course.number))
      .find((rel) => exists(rel));
    if (existing && !args.refresh) {
      record.outline = existing;
      filesSkipped++;
      const designation = (
        readJson(existing) as { info?: { designation?: unknown } }
      ).info?.designation;
      if (typeof designation === "string") {
        designations.set(designation, (designations.get(designation) ?? 0) + 1);
      }
      continue;
    }

    // Most recent term the course ran, then older ones; future terms only as a last resort.
    const order = [
      ...course.terms.filter((t) => !t.future).reverse(),
      ...course.terms.filter((t) => t.future).reverse(),
    ];
    let failed = false;
    search: for (const t of order) {
      const sections = sectionsOf.get(`${code}@${termKey(t.term)}`) ?? [];
      for (const section of outlineSectionCandidates(sections)) {
        const res = await client.getJson(
          apiUrl(settings.baseUrl, {
            ...t.term,
            dept: course.dept,
            number: course.number,
            section: section.value,
          }),
        );
        if (res.status === "not-found") continue;
        if (res.status === "failed") {
          outlineFailures.push(`${code}: ${res.reason}`);
          entryFor(t, course.dept).failures.push(
            `${code} outline: ${res.reason}`,
          );
          failed = true;
          break search;
        }
        const { outline, unknownKeys } = stripOutline(parseOutline(res.json));
        unknownKeys.forEach((k) => unexpected.add(k));
        const rel = outlinePath(t.term, course.dept, course.number);
        writeAtomic(rel, outline);
        entryFor(t, course.dept).files_written++;
        // Keep exactly one outline per course (matters with --refresh).
        for (const other of terms) {
          const otherRel = outlinePath(other.term, course.dept, course.number);
          if (otherRel !== rel && exists(otherRel)) rmSync(outFile(otherRel));
        }
        record.outline = rel;
        const designation = outline.info.designation;
        if (typeof designation === "string") {
          designations.set(
            designation,
            (designations.get(designation) ?? 0) + 1,
          );
        }
        break search;
      }
    }
    if (!record.outline && !failed)
      outlineFailures.push(`${code}: no lecture outline found`);
    if (++done % 25 === 0) console.log(`  outlines ${done}/${ran.size}`);
  }

  // ---- manifest ----
  const missing = requirementCodes.filter(
    (code) => !courseRecords[code]?.outline,
  );
  const previous: Partial<Manifest> = existsSync(outFile(MANIFEST_FILE))
    ? (readJson(MANIFEST_FILE) as Partial<Manifest>)
    : {};
  const termList = new Map(
    (previous.terms ?? []).map((t) => [t.term, t.future]),
  );
  for (const t of terms) termList.set(termKey(t.term), t.future);
  // A resumed run writes little, so keep earlier dates and reported fields.
  for (const [key, entry] of Object.entries(entries)) {
    const before = previous.entries?.[key];
    if (entry.files_written === 0 && before)
      entry.fetched_at = before.fetched_at;
    entry.files_on_disk = existsSync(outFile(key))
      ? readdirSync(outFile(key)).filter((f) => f.endsWith(".json")).length
      : 0;
  }
  for (const field of previous.unexpected_outline_fields ?? []) {
    unexpected.add(field);
  }
  const manifest: Manifest = {
    generated_by: "scripts/fetch-outlines.ts",
    terms: [...termList]
      .map(([term, future]) => ({ term, future }))
      .sort((a, b) => compareTerms(parseTerm(a.term), parseTerm(b.term))),
    entries: sortedObject({ ...previous.entries, ...entries }),
    courses: sortedObject({ ...previous.courses, ...courseRecords }),
    requirement_codes_without_data: missing,
    unexpected_outline_fields: [...unexpected].sort(),
  };
  writeAtomic(MANIFEST_FILE, manifest);

  // ---- summary ----
  const failures = Object.values(entries).reduce(
    (n, e) => n + e.failures.length,
    0,
  );
  const perDept = new Map<string, number>();
  for (const course of ran.values()) {
    perDept.set(course.dept, (perDept.get(course.dept) ?? 0) + 1);
  }
  console.log(`\nSUMMARY`);
  console.log(`  requests made:  ${client.stats.requests}`);
  console.log(`  files skipped:  ${filesSkipped} (already on disk)`);
  console.log(`  failures:       ${failures}`);
  for (const f of outlineFailures) console.log(`    ${f}`);
  console.log(`  courses found per department:`);
  for (const dept of allDepts) {
    console.log(
      `    ${dept.toUpperCase().padEnd(5)} ${perDept.get(dept) ?? 0}`,
    );
  }
  console.log(`  distinct designation strings (as returned):`);
  for (const [d, n] of [...designations].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`    ${JSON.stringify(d)}  x${n}`);
  }
  // B-Sci's exact string is unconfirmed; look for a "/"-separated part starting "Breadth-Sci"
  // (which does not match "Breadth-Social Sciences").
  const bSci = [...designations.keys()].filter((d) =>
    d.split("/").some((part) => part.trim().startsWith("Breadth-Sci")),
  );
  console.log(
    `  B-Sci designation string seen: ${bSci.length > 0 ? `yes, in ${bSci.map((d) => JSON.stringify(d)).join(", ")}` : "no"}`,
  );
  if (unexpected.size > 0) {
    console.log(
      `  UNEXPECTED outline fields (dropped; please review): ${[...unexpected].join(", ")}`,
    );
  }
  console.log(`  requirements.csv codes with no data: ${missing.length}`);
  for (const code of missing) console.log(`    ${code}`);
  const untitled = Object.entries(courseRecords)
    .filter(([, r]) => r.title === null)
    .map(([code]) => code);
  console.log(`  courses with no title in any course list: ${untitled.length}`);
  for (const code of untitled) console.log(`    ${code}`);
}

main().catch((error: unknown) => {
  if (error instanceof TooManyFailuresError)
    console.error(`\n${error.message}`);
  else console.error(error);
  process.exit(1);
});
