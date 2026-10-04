// Loads data/generated/*.json into Snowflake as app_user / app_role.
// Run from the project root:
//   node --env-file=.env.local scripts/load-snowflake.mjs
// Safe to rerun (CREATE OR REPLACE). Re-run after `npm run data:build`, then run
// scripts/build-search.mjs and `npm run data:parity`.
import snowflake from "snowflake-sdk";
import { readFileSync } from "node:fs";

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

const readJson = (name) => readFileSync(`data/generated/${name}`, "utf8");

// Each JSON file is loaded whole into one VARIANT cell, then split into tables in SQL.
const sources = {
  raw_courses: "courses.json",
  raw_prereqs: "prereqs.json",
  raw_requirements: "requirements.json",
  raw_offerings: "offerings.json",
};

const tables = {
  courses: `
    CREATE OR REPLACE TABLE courses AS
    SELECT f.value:code::STRING                AS code,
           f.value:title::STRING               AS title,
           f.value:units::NUMBER(3,1)          AS units,
           f.value:"level"::NUMBER             AS course_level,
           f.value:department::STRING          AS department,
           f.value:prerequisites_text::STRING  AS prerequisites_text,
           f.value:corequisites_text::STRING   AS corequisites_text,
           f.value:description::STRING         AS description,
           f.value:designations                AS designations,
           f.value:designation_raw::STRING     AS designation_raw,
           f.value:source_term::STRING         AS source_term
    FROM raw_courses, LATERAL FLATTEN(input => doc) f`,

  prereqs: `
    CREATE OR REPLACE TABLE prereqs AS
    SELECT f.value:code::STRING   AS code,
           f.value:status::STRING AS status,
           f.value:source::STRING AS source,
           f.value:raw::STRING    AS raw_text,
           IFF(IS_NULL_VALUE(f.value:prereq), NULL, f.value:prereq) AS prereq,
           IFF(IS_NULL_VALUE(f.value:coreq),  NULL, f.value:coreq)  AS coreq,
           f.value:raw_coreq::STRING       AS raw_coreq,
           f.value:unparsed_fragments      AS unparsed_fragments,
           f.value:advisory                AS advisory
    FROM raw_prereqs, LATERAL FLATTEN(input => doc) f`,

  requirements: `
    CREATE OR REPLACE TABLE requirements AS
    SELECT r.index                         AS position,
           r.value:req_id::STRING          AS req_id,
           r.value:program::STRING         AS program,
           r.value:concentration::STRING   AS concentration,
           r.value:catalog_term::STRING    AS catalog_term,
           r.value:"group"::STRING         AS req_group,
           r.value:"rule"::STRING          AS rule_type,
           IFF(IS_NULL_VALUE(r.value:n_or_units), NULL, r.value:n_or_units) AS n_or_units, -- VARIANT: keeps every digit (FLOAT comes back rounded)
           r.value:level_min::NUMBER       AS level_min,
           r.value:level_max::NUMBER       AS level_max,
           r.value:designation             AS designation,
           r.value:"filter"                AS filter_spec,
           r.value:min_grade::STRING       AS min_grade,
           r.value:notes::STRING           AS notes,
           r.value:source_url::STRING      AS source_url,
           r.value:status::STRING          AS status,
           r.value:verified_by::STRING     AS verified_by
    FROM raw_requirements, LATERAL FLATTEN(input => doc:requirements) r`,

  requirement_courses: `
    CREATE OR REPLACE TABLE requirement_courses AS
    SELECT r.value:req_id::STRING AS req_id,
           c.value::STRING        AS course_code,
           c.index                AS position
    FROM raw_requirements,
         LATERAL FLATTEN(input => doc:requirements) r,
         LATERAL FLATTEN(input => r.value:"courses") c`,

  course_offerings: `
    CREATE OR REPLACE TABLE course_offerings AS
    SELECT f.key::STRING AS code,
           f.value       AS offerings
    FROM raw_offerings, LATERAL FLATTEN(input => doc) f`,
};

conn.connect(async (err) => {
  if (err) {
    console.error("CONNECT FAILED:", err.message);
    process.exit(1);
  }
  try {
    // Old flat schema from the first setup; replaced by `requirements`.
    await run("DROP TABLE IF EXISTS requirement_groups");

    for (const [table, file] of Object.entries(sources)) {
      await run(`CREATE OR REPLACE TEMPORARY TABLE ${table} (doc VARIANT)`);
      await run(`INSERT INTO ${table} SELECT PARSE_JSON(?)`, [readJson(file)]);
      console.log(`OK  read   ${file}`);
    }

    for (const [name, sql] of Object.entries(tables)) {
      await run(sql);
      console.log(`OK  built  ${name}`);
    }

    const counts = await run(
      Object.keys(tables)
        .map((t) => `SELECT '${t}' AS tbl, COUNT(*) AS n FROM ${t}`)
        .join(" UNION ALL ")
    );
    console.log("\nRow counts (expect courses 457, prereqs 457, requirements 96, course_offerings 457):");
    for (const r of counts) console.log(`  ${r.TBL.padEnd(20)} ${r.N}`);

    const check = await run(
      "SELECT prereq:type::STRING AS t, ARRAY_SIZE(prereq:of) AS branches FROM prereqs WHERE code = 'BUS 312'"
    );
    console.log("\nBUS 312 prereq tree root (expect type 'any' = OR):", check[0]);
  } catch (e) {
    console.error("\nFAILED:", e.message);
    process.exitCode = 1;
  } finally {
    conn.destroy(() => {});
  }
});
