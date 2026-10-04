# data/raw/outlines

SFU Course Outlines API data saved by `npm run data:fetch` (`scripts/fetch-outlines.ts`). Committed; never hand-edited. Re-run the script to refresh (`--refresh` re-fetches everything, `--refresh-outlines` only the outlines).

## Layout

```
_manifest.json                              per term/department: date fetched, courses found, files
                                            on disk, courses not offered, failures; per course: terms it
                                            ran, section types per term, and where its outline is
{year}/{term}/{dept}/_courses.json          the department's course list for that term, as returned
{year}/{term}/{dept}/{number}.sections.json the course's section list for that term (local cache only,
                                            gitignored; the manifest keeps the section types)
{year}/{term}/{dept}/{number}.outline.json  ONE outline per course, from the most recent term it ran
```

- Departments and course numbers are lowercase, as the API returns them (`bus/217w`).
- A course ran in a term if the manifest lists section types for it there (`courses[code].sections`); otherwise see `not_offered`.
- Terms marked `future` in the manifest (e.g. 2027 spring) are scheduled, not yet run.
- Course lists include graduate courses; only undergraduate courses (numbers below 500) get section lists and outlines.
- `npm run data:build` turns this folder into `data/generated/courses.json`, `offerings.json`, and `unknown-courses.json`.

## Stripping rule

Outlines are stripped before they are written: only `info` is kept, with course-level fields (title, units, prerequisites, corequisites, designation, description, department, level, delivery method, notes). Instructor data and section notes, grading, textbooks, and class or exam schedules are removed, and emails, phone numbers, and instructor names are redacted from all kept text. Values are otherwise stored exactly as returned (`designation` is not mapped to W/Q/B). The exact field lists are in `docs/outlines-api.md`.
