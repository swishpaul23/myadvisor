# src/engine/plan

Plan validator: `validatePlan(student, plan, catalog, declarations)` returns violations, running unit totals,
the graduation term (via the audit with includePlanned) and the remaining blockers. Spec: `docs/validator-spec.md`.
Tested in `tests/engine/plan.test.ts`; the golden plan's expected result was written by hand before this code.
