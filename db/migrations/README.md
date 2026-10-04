# db/migrations

Numbered plain `.sql` files (`001_init.sql`, `002_...sql`), applied in filename order by `npm run db:migrate`.
Never edit a migration that has already run; add a new one instead. No TypeScript, no seed data.
