# scripts

Data and database scripts run with `tsx` via npm: `data:fetch` (SFU Course Outlines), `data:build` (CSV + outlines to JSON/Postgres), `db:migrate`.
`validate-requirements.ts` is the pure requirements.csv validator used by `build-data.ts` (tested in `tests/scripts/`). Not imported by the app. Scripts may read `.env.local` via `dotenv`.
`audit-cli.ts` (`npm run audit -- <student.json>`) prints one student's audit to the terminal only; template in `tests/private/student.template.json`, real records in `tests/private/` (gitignored).
Snowflake (`myadvisor.app`, key-pair auth from `.env.local`), run from the project root after `data:build`: `node --env-file=.env.local scripts/load-snowflake.mjs` (tables), then `scripts/build-search.mjs` (`calendar_chunks`, plain ILIKE search, no Cortex), then `npm run data:parity` (Snowflake must equal `data/generated/`). `scripts/snowflake-smoke.mjs` only checks the connection.
