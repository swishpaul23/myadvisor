# src/engine/plan

Plan validator: `validatePlan(student, plan, catalog, declarations)` returns violations, running unit totals,
the graduation term (via the audit with includePlanned) and the remaining blockers. Spec: `docs/validator-spec.md`.
Tested in `tests/engine/plan.test.ts`; the golden plan's expected result was written by hand before this code.

Next-term suggestion: `suggestNextTerm(student, catalog, { termId, courseLoad }, declarations)` (`suggest.ts`). Candidates are the
courses of unmet rows that name exactly one course, in sheet order; each is kept only if `validatePlan` finds no violation
for it alone in that term. Chosen courses fill the load and the rest are open slots. Rule decided by Stuart (2026-10-04);
expected results in `tests/engine/fixtures/suggest.expected.ts` were written by hand first.

Multi-term plan: `planRemaining(student, catalog, { startTerm, courseLoad, summer, coopTerms }, declarations)` (`remaining.ts`).
Every term from the start term until the remaining requirements are planned: named courses from unmet rows with a course
list (options in list order, preferring ones with course data and offerings; `choice` marks a swappable pick), placed term by
term while the validator finds no blocking problem (prerequisites, offered that season, entry GPA); then placeholder electives
for rows that count units, levels or designations (3 units each, ASSUMPTION). Co-op work terms stay empty; summer is a study
term only when chosen. Rules decided by Stuart (2026-10-04); hand-worked expectations in `tests/engine/plan-remaining.test.ts`.
