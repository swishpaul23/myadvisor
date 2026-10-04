/**
 * snowflake-parity.ts. Run with `npm run data:parity` (reads .env.local).
 *
 * Checks that Snowflake (myadvisor.app) holds exactly the data in data/generated/: reads
 * both through the app's own readers (src/lib/data/json.ts and snowflake.ts), compares
 * every field of courses, prereqs, requirements (with row and course order) and
 * course_offerings, compares calendar_chunks with the chunks built from JSON, and runs the
 * same calendar searches on both. Exits 1 on any difference.
 *
 * Run after `npm run data:build` + scripts/load-snowflake.mjs + scripts/build-search.mjs.
 * Uses `--conditions=react-server` so the readers' `import "server-only"` loads outside Next.
 */
import { isDeepStrictEqual } from "node:util";
import { buildCalendarChunks, searchChunks } from "@/lib/data/calendar-search";
import * as J from "@/lib/data/json";
import * as S from "@/lib/data/snowflake";
import { query } from "@/lib/snowflake";

const QUESTIONS = [
  "Do I still need BUS 393?",
  "prereqs for BUS 360W",
  "What are the Finance concentration electives?",
  "Is there a course on investments?",
  "bus 312 and BUS 315",
  "ZZZ 999 derivatives",
  "what should I do?",
];

type Row = Record<string, unknown>;

const short = (v: unknown) => {
  const s = JSON.stringify(v) ?? "undefined";
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
};

function report(name: string, diffs: string[]): number {
  console.log(`${diffs.length === 0 ? "SAME" : "DIFF"}  ${name}`);
  for (const d of diffs.slice(0, 15)) console.log(`      ${d}`);
  if (diffs.length > 15) console.log(`      … ${diffs.length - 15} more`);
  return diffs.length;
}

/** Field-by-field comparison of two record lists keyed by `key`, including their order. */
function compare(name: string, json: Row[], snow: Row[], key: string): number {
  const diffs: string[] = [];
  if (json.length !== snow.length)
    diffs.push(`count: json ${json.length} | snowflake ${snow.length}`);
  if (
    !isDeepStrictEqual(
      json.map((x) => x[key]),
      snow.map((x) => x[key]),
    )
  )
    diffs.push("order or keys differ");
  const bySnowKey = new Map(snow.map((x) => [x[key], x]));
  for (const x of json) {
    const y = bySnowKey.get(x[key]);
    if (!y) {
      diffs.push(`${String(x[key])}: missing in snowflake`);
      continue;
    }
    for (const field of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!isDeepStrictEqual(x[field], y[field]))
        diffs.push(
          `${String(x[key])}.${field}: json ${short(x[field])} | snowflake ${short(y[field])}`,
        );
    }
  }
  return report(
    `${name} (${json.length} json, ${snow.length} snowflake)`,
    diffs,
  );
}

/** Chunks compared as whole lines (type | code | url | text), ignoring order. */
function compareChunks(json: string[], snow: string[]): number {
  const count = (lines: string[]) =>
    lines.reduce(
      (m, l) => m.set(l, (m.get(l) ?? 0) + 1),
      new Map<string, number>(),
    );
  const cj = count(json);
  const cs = count(snow);
  const diffs = [
    ...[...cj]
      .filter(([l, n]) => (cs.get(l) ?? 0) < n)
      .map(([l]) => `only json:      ${l.slice(0, 200)}`),
    ...[...cs]
      .filter(([l, n]) => (cj.get(l) ?? 0) < n)
      .map(([l]) => `only snowflake: ${l.slice(0, 200)}`),
  ];
  return report(
    `calendar_chunks (${json.length} built from JSON, ${snow.length} in Snowflake)`,
    diffs,
  );
}

async function main() {
  const start = Date.now();
  const [sc, sp, sr, so] = await Promise.all([
    S.readCourses(),
    S.readPrereqs(),
    S.readRequirements(),
    S.readCourseOfferings(),
  ]);
  console.log(`Snowflake read + validation: ${Date.now() - start} ms\n`);
  const [jc, jp, jr, jo] = await Promise.all([
    J.readCoursesJson(),
    J.readPrereqsJson(),
    J.readRequirementsJson(),
    J.readCourseOfferingsJson(),
  ]);

  let total = 0;
  total += compare("courses", jc, sc, "code");
  total += compare("prereqs", jp, sp, "code");
  total += compare(
    "requirements (with row and course order)",
    jr,
    sr,
    "req_id",
  );
  const entries = (o: Record<string, unknown>) =>
    Object.entries(o).map(([code, offerings]) => ({ code, offerings }));
  total += compare("course_offerings", entries(jo), entries(so), "code");

  const chunks = buildCalendarChunks(jc, jr);
  const line = (c: Row) =>
    [c.section_type, c.course_code ?? "-", c.source_url, c.text].join(" | ");
  const snowChunks = await query(
    "SELECT section_type, course_code, source_url, text FROM myadvisor.app.calendar_chunks",
  );
  total += compareChunks(
    chunks.map(line),
    snowChunks.map((r) =>
      line({
        section_type: r.SECTION_TYPE,
        course_code: r.COURSE_CODE,
        source_url: r.SOURCE_URL,
        text: r.TEXT,
      }),
    ),
  );

  console.log("\nsearchCalendar, same question on both:");
  for (const q of QUESTIONS) {
    const a = searchChunks(chunks, q);
    const b = await S.searchCalendarSnowflake(q);
    const same = isDeepStrictEqual(a, b);
    if (!same) total += 1;
    const codes = (hits: typeof a) =>
      hits.map((h) => h.course_code ?? "req").join(", ");
    console.log(
      `  ${same ? "SAME" : "DIFF"}  "${q}"  json [${codes(a)}]${same ? "" : `  snowflake [${codes(b)}]`}`,
    );
  }

  console.log(`\nTotal differences: ${total}`);
  return total;
}

main().then(
  (total) => process.exit(total === 0 ? 0 : 1),
  (err: unknown) => {
    console.error(
      `FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  },
);
