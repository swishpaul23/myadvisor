# scripts/lib/prereqs

Deterministic prerequisite parser used by `npm run data:build` to write `data/generated/prereqs.json`.
`lexer.ts` tokens, `clause.ts` one clause (commas, and/or, grades, "one of"), `index.ts` sentences and records,
`report.ts` fragment patterns and cross-checks. No LLM calls. Never guesses: unclear text becomes an `unknown` node verbatim.
Tested in `tests/scripts/prereqs.test.ts` with real calendar strings.
