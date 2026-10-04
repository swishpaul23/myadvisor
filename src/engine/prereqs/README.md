# src/engine/prereqs

Three-valued prerequisite evaluation (met / unmet / unknown, Kleene logic) over prereqs.json trees.
Pure: completed grades, earlier-planned and same-term courses come in as a context. Spec: `docs/validator-spec.md` section 2.
Tested in `tests/engine/prereqs-evaluate.test.ts`.
