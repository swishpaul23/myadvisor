// Checks the Snowflake connection: key-pair login, then the role, warehouse, database and
// schema the app uses. Run from the project root:
//   node --env-file=.env.local scripts/snowflake-smoke.mjs
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

const steps = [
  "USE ROLE app_role",
  "USE WAREHOUSE demo_wh",
  "USE DATABASE myadvisor",
  "USE SCHEMA app",
  "SELECT CURRENT_ROLE() AS role, CURRENT_WAREHOUSE() AS wh, CURRENT_DATABASE() AS db, CURRENT_SCHEMA() AS sch",
];

conn.connect(async (err) => {
  if (err) { console.error("CONNECT FAILED:", err.message); process.exit(1); }
  for (const sqlText of steps) {
    await new Promise((resolve) =>
      conn.execute({
        sqlText,
        complete: (e, _s, rows) => {
          console.log(e ? `FAILED  ${sqlText}\n   -> ${e.message}` : `OK      ${sqlText}`);
          if (!e && rows?.length && sqlText.startsWith("SELECT")) console.log(rows);
          resolve();
        },
      })
    );
  }
  conn.destroy(() => {});
});