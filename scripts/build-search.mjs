// Builds calendar_chunks (plain table, searched with ILIKE by src/lib/data/snowflake.ts).
// No Cortex Search: it is blocked on the trial account.
// Run from the project root, after scripts/load-snowflake.mjs:
//   node --env-file=.env.local scripts/build-search.mjs
// Safe to rerun (CREATE OR REPLACE).
import snowflake from "snowflake-sdk";

snowflake.configure({ logLevel: "ERROR" });

const conn = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USER,
  authenticator: "SNOWFLAKE_JWT",
  privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
  role: process.env.SNOWFLAKE_ROLE,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
});

const run = (sqlText, binds) =>
  new Promise((resolve, reject) =>
    conn.execute({
      sqlText,
      binds,
      complete: (e, _s, rows) => (e ? reject(new Error(e.message)) : resolve(rows)),
    })
  );

// One chunk per course, one per requirement row. Each carries a source_url for citations.
const CHUNKS = `
  CREATE OR REPLACE TABLE calendar_chunks AS
  SELECT 'course' AS section_type,
         c.code AS course_code,
         c.code || ' ' || c.title || ' (' || COALESCE(c.units::STRING, '?') || ' units). '
           || COALESCE(c.description, '')
           || ' Prerequisites: ' || COALESCE(NULLIF(c.prerequisites_text, ''), 'none')
           || COALESCE(' Corequisites: ' || NULLIF(c.corequisites_text, ''), '') AS text,
         'https://www.sfu.ca/students/calendar/' || SPLIT_PART(c.source_term, '-', 1) || '/'
           || SPLIT_PART(c.source_term, '-', 2) || '/courses/'
           || LOWER(SPLIT_PART(c.code, ' ', 1)) || '/' || LOWER(SPLIT_PART(c.code, ' ', 2)) || '.html' AS source_url
  FROM courses c
  UNION ALL
  SELECT 'requirement' AS section_type,
         NULL AS course_code,
         r.program || ' ' || COALESCE(r.concentration, '') || ' / ' || COALESCE(r.req_group, '') || ': '
           || COALESCE(r.rule_type, '') || ' ' || COALESCE(r.n_or_units::NUMBER(6,1)::STRING, '')
           || COALESCE(' Courses: ' || rc.course_list, '')
           || COALESCE(' Notes: ' || r.notes, '') AS text,
         r.source_url AS source_url
  FROM requirements r
  LEFT JOIN (
    SELECT req_id, LISTAGG(course_code, ', ') AS course_list
    FROM requirement_courses GROUP BY req_id
  ) rc ON rc.req_id = r.req_id`;

conn.connect(async (err) => {
  if (err) {
    console.error("CONNECT FAILED:", err.message);
    process.exit(1);
  }
  try {
    await run(CHUNKS);
    const n = await run(
      "SELECT section_type, COUNT(*) AS n FROM calendar_chunks GROUP BY 1 ORDER BY 1"
    );
    console.log("OK  built calendar_chunks");
    console.log("\nRow counts (expect course 457, requirement 96):");
    for (const r of n) console.log(`  ${r.SECTION_TYPE.padEnd(12)} ${r.N}`);
  } catch (e) {
    console.error("\nFAILED:", e.message);
    process.exitCode = 1;
  } finally {
    conn.destroy(() => {});
  }
});
