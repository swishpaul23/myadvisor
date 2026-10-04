# Decisions

One entry per decision: what we decided, why, and what we rejected.

## 1. One Next.js TypeScript app, no separate Python backend

- **Decision:** UI, API route handlers, rules engine, and LLM calls all live in one Next.js app.
- **Reason:** One language, one deploy (Vercel), shared types between engine and UI, less glue in a 24-hour build.
- **Rejected:** A Python (FastAPI) backend with a React frontend: two runtimes, duplicated types, more deploy work.

## 2. The engine is pure and database-free

- **Decision:** `src/engine` takes data as arguments and returns results. No React, Next, database, LLM, or Node I/O imports, enforced by ESLint.
- **Reason:** Deterministic, fast unit tests; the LLM can only explain what the engine computed.
- **Rejected:** Engine querying Postgres directly (slow, hard to test); letting the LLM reason about rules (it guesses).

## 3. Files are the source of truth; Postgres is rebuilt from them

- **Decision:** Rules live in CSVs exported from the teammate's Google Sheet; course data in saved SFU Outlines API responses. `npm run data:build` validates them, writes a JSON snapshot, and loads Postgres when `DATABASE_URL` is set.
- **Reason:** Reviewable in git diffs, works offline, and the app can fall back to the JSON snapshot if the database is down.
- **Rejected:** Editing rules directly in the database (no history, no review); calling the SFU API at request time (slow, rate limits).

## 4. Plain SQL migrations with `pg`

- **Decision:** Numbered `.sql` files in `db/migrations/`, applied by `scripts/db-migrate.ts` using `pg`.
- **Reason:** No ORM to learn under time pressure; SQL is portable across Postgres hosts.
- **Rejected:** Prisma and Drizzle (extra tooling, generated clients, host-specific quirks).

## 5. Database host undecided: standard Postgres only

- **Decision:** Choose between Snowflake Postgres and Supabase/Neon later; use only standard Postgres features until then.
- **Reason:** Keeps both options open; the app also runs without a database using the JSON snapshot.
- **Rejected:** Committing now to host-specific features (Supabase auth/RLS helpers, Snowflake-only SQL).

## 6. Scope: Beedie BBA, 9 concentrations, 2026-fall

- **Decision:** The BBA major and all 9 concentrations on the SFU Fall 2026 calendar (`catalog_term` = `2026-fall`). Finance is the demo program.
- **Reason:** Covers every Beedie BBA student while keeping one calendar to verify.
- **Rejected:** Finance only (too narrow to pitch); joint majors, honours, other faculties, other calendar terms (too much rule data to verify).

## 7. The advising checklist PDF is a cross-check, not a source of truth

- **Decision:** The Beedie advising checklist (Fall 2025 to Summer 2026) is used only to cross-check rows; every rule cites the Fall 2026 calendar.
- **Reason:** The checklist is for an older term and may differ from the 2026-fall calendar.
- **Rejected:** Transcribing the checklist directly into the requirements sheet.
