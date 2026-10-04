# src/app

Next.js routes, layouts, and API route handlers only. Keep handlers thin: parse input with zod, call the engine or `lib/`, return the result.
No business rules here; they belong in `src/engine`.
