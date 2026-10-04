# data/raw/outlines

SFU Course Outlines API data saved by `npm run data:fetch` (`scripts/fetch-outlines.ts`). Committed; never hand-edited. Re-run the script to refresh (`--refresh` re-fetches existing files).

## Layout

```
_manifest.json                              per term/department: date fetched, courses found, files
                                            written/skipped, courses not offered, failures; per course:
                                            terms it ran and where its outline is
{year}/{term}/{dept}/_courses.json          the department's course list for that term, as returned
{year}/{term}/{dept}/{number}.sections.json the course's section list for that term, as returned
{year}/{term}/{dept}/{number}.outline.json  ONE outline per course, from the most recent term it ran
```

- Departments and course numbers are lowercase, as the API returns them (`bus/217w`).
- No sections file for a term means the course did not run that term (see `not_offered` in the manifest).
- Terms marked `future` in the manifest (e.g. 2027 spring) are scheduled, not yet run.
- Course and section lists include graduate courses; only undergraduate courses (numbers below 500) get section lists and outlines.

## Stripping rule

Outlines are stripped before they are written: only `info` is kept, with course-level fields (title, units, prerequisites, corequisites, designation, description, department, level, delivery method, notes). Instructor data, grading, textbooks, and class or exam schedules are removed, and emails, phone numbers, and instructor names are redacted from kept text. Values are otherwise stored exactly as returned (`designation` is not mapped to W/Q/B). The exact field lists are in `docs/outlines-api.md`.
