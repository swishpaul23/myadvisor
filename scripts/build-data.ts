/**
 * build-data.ts (placeholder, no logic yet). Run with `npm run data:build`.
 *
 * Will read data/sheets/*.csv, data/raw/outlines/, and data/policy/sfu.json, then:
 * - Validate: every course code in a requirement exists, every row has a source_url,
 *   and there are no unknown rule types.
 * - Report rows with status `beta` or "unsure" in notes.
 * - Upsert the reference tables into Postgres when DATABASE_URL is set.
 * - Always write the JSON snapshot to data/generated/.
 * - Be idempotent: running it twice gives the same result.
 */
