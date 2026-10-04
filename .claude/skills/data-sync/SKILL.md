---
name: data-sync
description: Rebuild the data snapshot with npm run data:build and report counts, rows needing review, and what changed since the last build.
disable-model-invocation: true
---

# /data-sync

1. Run `git status --short data/` and note any uncommitted changes under `data/generated/` before building.
2. Run `npm run data:build`. If it fails validation, report every error (file, row, reason) and stop. Do not edit the CSVs to make it pass.
3. Report:
   - how many requirement rows and how many courses loaded (per program and concentration if the output gives it)
   - rows with `status` = `beta`
   - rows with "unsure" in `notes`
   - rows with no `source_url`
4. Show what changed since the last build: `git diff --stat data/generated/`, then summarize added, removed, and changed requirements and courses in plain language.
5. Do not commit. Do not run `data:fetch` or `db:migrate`; they touch the network and the database, so ask Stuart first.
