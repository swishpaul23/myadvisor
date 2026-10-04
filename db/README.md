# db

Postgres schema for myAdvisor. Standard Postgres only (target is Snowflake Postgres or Supabase/Neon, undecided).
Schema changes go in `migrations/` and are applied with `npm run db:migrate`.
No data lives here: reference tables are loaded by `npm run data:build`; student tables are written by the app.
