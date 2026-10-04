---
name: check
description: Run npm run check (lint, typecheck, test), fix the failures that are safe to fix, and repeat until green. Use before calling any task done.
---

# /check

1. Run `npm run check`. It runs lint, then typecheck, then tests, and stops at the first failure.
2. If it fails, read the error and fix it when the fix is safe and mechanical:
   - lint errors (unused imports, formatting, simple rule violations)
   - type errors with an obvious correct type
   - test failures caused by a clear bug in code you just wrote
3. Run `npm run check` again. Repeat until it passes.
4. Stop and ask Stuart instead of fixing when:
   - a test's expected value looks wrong (the test may encode a requirement; never change a test to make it pass without asking)
   - the fix would change a requirement, prerequisite, or grade rule
   - the fix needs a new dependency, or would disable a lint rule or loosen `tsconfig.json`
   - the engine purity rule fires (move the import out of `src/engine` instead of silencing the rule)
   - the same failure persists after two attempts
5. Summarize: what failed, what you changed (file list), and the final result of each step (lint, typecheck, test).
