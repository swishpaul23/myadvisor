# src/engine/audit

Degree audit: `audit(student, catalog, options)` returns one result per requirement row (spec: `docs/engine-spec.md`).
`courses.ts` attempts to facts, `grades.ts` grade rules, `eligibility.ts` filters, `matching.ts` Hopcroft-Karp,
`rules.ts` one evaluator per rule kind, `audit.ts` tiers and summary. Pure: no I/O; callers pass catalog and policy.
Tests: `tests/engine/` (demo student expectations were written by hand before this code).
