# scripts/lib/outlines

Small helpers for `scripts/fetch-outlines.ts`: URL builder, term range, file paths, response parsing,
person-data stripping, requirements course-code extraction, robots.txt check, and the throttled HTTP client.
Pure except `client.ts` (which takes fetch and sleep as arguments). Tested in `tests/scripts/outlines.test.ts`.
