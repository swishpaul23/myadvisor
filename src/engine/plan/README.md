# src/engine/plan

Plan validator: `validatePlan(student, plan, catalog, declarations)` returns violations, running unit totals,
the graduation term (via the audit with includePlanned) and the remaining blockers. Spec: `docs/validator-spec.md`.
Tested in `tests/engine/plan.test.ts`; the golden plan's expected result was written by hand before this code.

Next-term suggestion: `suggestNextTerm(student, catalog, { termId, courseLoad }, declarations)` (`suggest.ts`). Candidates are the
courses of unmet rows that name exactly one course, in sheet order; each is kept only if `validatePlan` finds no violation
for it alone in that term. Chosen courses fill the load and the rest are open slots. Rule decided by Stuart (2026-10-04);
expected results in `tests/engine/fixtures/suggest.expected.ts` were written by hand first.
