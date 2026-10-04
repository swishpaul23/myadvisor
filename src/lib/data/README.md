# src/lib/data

Loads reference data into typed objects validated with zod. Hands plain data to the engine; does no rule computation itself.

- `source.ts`: `loadReferenceData()` and `searchCalendar()`. `DATA_SOURCE=json` (default) reads `data/generated/`; `DATA_SOURCE=snowflake` reads `myadvisor.app` and falls back to JSON on error or after `SNOWFLAKE_TIMEOUT_MS` (default 15000).
- `json.ts` / `snowflake.ts`: the two readers (server-only). Policy and unknown-courses always come from JSON.
- `calendar-search.ts`: pure search helpers (course codes, keywords, chunks), shared by both sources. No Cortex Search or embeddings.
