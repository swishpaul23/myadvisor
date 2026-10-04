# scripts

Data and database scripts run with `tsx` via npm: `data:fetch` (SFU Course Outlines), `data:build` (CSV + outlines to JSON/Postgres), `db:migrate`.
`validate-requirements.ts` is the pure requirements.csv validator used by `build-data.ts` (tested in `tests/scripts/`). Not imported by the app. Scripts may read `.env.local` via `dotenv`.
