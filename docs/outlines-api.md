# SFU Course Outlines API: observed behaviour

Explored 2026-10-03 with real requests (1 per second). Raw responses are in `data/raw/_samples/`.
Docs: https://www.sfu.ca/outlines/help/api.html. robots.txt does not disallow `/bin/wcm/course-outlines` and sets no crawl-delay.

## URL forms that worked

Base: `https://www.sfu.ca/bin/wcm/course-outlines`. The path goes in the query string, with no key.

| Level | URL | Sample file |
|---|---|---|
| Years | base, no query | `years.json` |
| Terms | `?2026` | `terms-2026.json` |
| Departments | `?2026/fall` | `depts-2026-fall.json` |
| Courses | `?2026/fall/bus` | `courses-2026-fall-bus.json` |
| Sections | `?2026/fall/bus/312` | `sections-2026-fall-bus-312.json` |
| Outline | `?2026/fall/bus/312/d100` | `outline-2026-fall-bus-312-d100.json` |

- All responses are `application/json;charset=utf-8`; list levels return a JSON array.
- `?current` works as a year (returns the current year's terms).
- Department case does not matter (`BUS` and `bus` both work). Use the lowercase `value` from the list.
- Course numbers keep their suffix in lowercase: `217w`, `360w`, `100w`. The course code is `{DEPT} {number uppercased}`, e.g. `BUS 360W`.

## Fields at each level

- **Years:** `[{ text: "2026", value: "2026" }]`, 2014 onward.
- **Terms:** `[{ text: "FALL", value: "fall" }]`. Values are `spring | summer | fall`.
- **Departments:** `{ text: "BUS", value: "bus", name: "Business Administration" }`. 78 departments in 2026 fall.
- **Courses:** `{ text: "312", value: "312", title: "Introduction to Finance" }`. Graduate courses are mixed in (BUS 2026 fall: 151 courses, 65 numbered 500+), so filter by number.
- **Sections:** `{ text: "D100", value: "d100", title, classType, sectionCode, associatedClass }`.
  - `sectionCode`: `LEC`, `TUT`, `LAB`, etc. `classType`: `e` = enrolment section (lecture), `n` = non-enrolment (tutorial or lab tied to a lecture via `associatedClass`).
- **Outline:** top-level keys `info`, `instructor`, `courseSchedule`, `grades`, `requiredText`.

## Where the data we need lives (`info` in the outline)

| Need | Field | Example |
|---|---|---|
| Title | `info.title` | `"Introduction to Finance"` |
| Description | `info.description` | plain text |
| Units | `info.units` | `"3"` (a string; BUS 360W is `"4"`) |
| Prerequisites | `info.prerequisites` | free text, e.g. `"BUS 254 and (BUS 232 or ECON 233 or STAT 270 or STAT 271), both with a minimum grade of C- and 45 units; ..."` |
| Corequisites | `info.corequisites` | free text, often `""` |
| WQB designation | `info.designation` | `"Quantitative"`, `"Writing"`, `"Writing/Breadth-Humanities"`; `/`-separated |
| Course identity | `info.dept`, `info.number` | `"BUS"`, `"312"` |
| Level | `info.degreeLevel` | `"UGRD"` |
| Term | `info.term` | `"Fall 2026"` |
| Special topic | `info.specialTopic` | `""` unless a topics course |

Other fields: `section`, `classNumber`, `outlinePath`, `name` (`"BUS 312 D100"`), `deliveryMethod`, `notes`, `departmentalUgradNotes`, `registrarNotes` (HTML), `requiredReadingNotes`.

## A course or section that did not run

HTTP **404** with body `{"errorMessage":"Invalid Query String or Object does not exist."}`. Seen for a course absent from the term (`?2026/fall/bus/488`) and for a missing section (`?2026/fall/bus/312/x999`). The same message covers a bad query and a missing object, so the fetcher should only request paths taken from the list one level up, then treat 404 as "not offered".

## Do sections share outline content?

Yes for course-level fields. BUS 312 D100 and D200 (2026 fall) differ only in `section`, `classNumber`, `outlinePath`, `name`, and `courseSchedule` (campus, days, times). `title`, `description`, `units`, `prerequisites`, `corequisites`, and `designation` are identical. So one lecture (`classType` `e`) outline per course per term is enough for course data. Instructor-specific fields (`instructor`, `grades`, `requiredText`) can differ.

## Quirks

- `units` is a string. Parse it, and expect `"0"` for zero-unit courses (e.g. the professional development series) and possibly ranges or blanks (not seen yet).
- Prerequisite text mixes course logic, grade minimums, unit counts, and program admission ("open to students admitted to the business administration major..."). It needs a parser plus `data/sheets/prereq-overrides.csv`.
- Only these designation strings have been seen so far: `Quantitative`, `Writing`, `Breadth-Humanities`. The exact strings for B-Soc and B-Sci are **unverified**; check them before mapping.
- Outlines include instructor names and contact fields in `instructor`. We strip them before saving (see below).
- Some outlines (PHIL 100W) have extra top-level keys `grades` and `requiredText`, and extra `info` keys `educationalGoals`, `courseDetails`, `gradingNotes`, `materials`. BUS 312 and BUS 360W have none of these.
- **Course-list entries can lack `title`.** `?2025/spring/engl` (fetched 2026-10-03, saved as `data/raw/_samples/courses-2025-spring-engl.json`) has 43 entries; ENGL 345 and ENGL 811 are `{"text":"345","value":"345"}` with no `title` key. Found by the first dry run, which stopped on it. Decision (Stuart): `title` is optional in the course-list parser; such courses are still fetched (the outline has `info.title`), saved files stay as returned, the manifest records `title: null`, and the run summary lists them.
- **BUEC is not an API department.** `buec` is absent from the 2026 fall department list, and the dry run (2026-10-03) found 0 BUEC courses in all seven terms 2025 spring to 2027 spring (each course-list request 404s). Decision (Stuart): dropped from the default departments in `scripts/outlines.config.json`. BUEC stays in the requirements filter text (`dept not in BUS,BUEC`), which the engine handles without course data.
- **Some requirements.csv departments had no listed course in any fetched term:** CA, EASC, PSYC (0 matching courses across the seven terms). Those codes will appear as "no data" after the full run.
- **Found by the BUS-only run (2026-10-03, 7 terms, 107 courses):**
  - A new top-level outline key, `examSchedule`, on at least one BUS outline. It was dropped as unknown (not saved). Decision (Stuart): added to the known-dropped list (it is a schedule).
  - `info.designation` values seen: `"N/A"` (92 of 107 BUS outlines, e.g. BUS 201), `"Quantitative"` (8), `"Breadth-Social Sciences"` (4), `"Writing"` (2), and `""` (1, BUS 296). So "no designation" appears as both `"N/A"` and `""`, and B-Soc is `"Breadth-Social Sciences"`. B-Sci is still unseen.
  - BUS 296 (STT-Directed Studies, 2025 spring) has no `info.units` key at all, and empty `degreeLevel`, `description`, and `designation`. Directed-studies courses may be thin; don't assume every outline field exists. Decision (Stuart): saved as returned; missing fields stay missing.
  - Decision (Stuart): `designation` is stored exactly as returned, including `"N/A"` and `""`; no normalizing at fetch time.
  - A course can be on a term's course list but its section list 404s: BUS 296 in 2025 summer and BUS 396 in 2026 spring (both directed studies). Recorded as not offered.
  - BUS 450 (Innovation Consulting) appears only in 2027 spring, so its outline comes from that future term (`ran: []` in the manifest).
- **Found by the full run (2026-10-03, 8 whole departments + requirements-listed courses, 457 courses):**
  - Three more unexpected outline fields, dropped and not saved: top-level `recommendedText`, and `info.requirements`, `info.shortNote`. Which courses carry them was not recorded (a resumed run then overwrote the manifest's list; the manifest now keeps earlier reports). Decision (Stuart, 2026-10-04): keep `info.requirements` and `info.shortNote` (scrubbed like other text); keep dropping `recommendedText` (textbooks). All 457 outlines were re-fetched with `npm run data:fetch -- --refresh-outlines`.
  - What they contain (after the re-fetch): `info.requirements` on 35 outlines, `info.shortNote` on 7, all strings. They are **section-level instructor text, not program or course requirements**: attendance and Canvas expectations, AI and Turnitin policies, public-health delivery notices, book lists (ENGL 204, INDG 250), grading notes (INDG 462), and occasionally a prerequisite-like line (LBST 101: "LBST 100 or 101 is a prerequisite"). The engine and chat must not treat `requirements_text` or `short_note` as requirements or prerequisites; the calendar and `prerequisites` remain the source.
  - `info.designation` is not a clean list. Distinct values (count): `"N/A"` 277, `"Quantitative"` 60, `"Writing"` 35, `"Breadth-Social Sciences"` 23, `"Breadth-Humanities"` 21, `"Writing/Breadth-Humanities"` 12, `"Breadth-Humanities/Social Sciences"` 10, `"Writing/Quantitative"` 5, `"Quantitative/Breadth-Soc"` 4, `"Breadth-Science"` 3, `"Writing/Breadth-Social Sci"` 3, `""` 1, `"Breadth-Hum/Social Sci/Science"` 1, `"Breadth-Social Sci/Science"` 1, `"Quantitative/Breadth-Science"` 1. B-Sci appears as `Breadth-Science`, and abbreviated as `Science` after another breadth. B-Soc appears as `Breadth-Social Sciences`, `Breadth-Soc`, `Social Sciences`, and `Social Sci`. Splitting on `/` alone is not enough: `"Breadth-Hum/Social Sci/Science"` means B-Hum, B-Soc, and B-Sci. Any later mapping to W/Q/B-Soc/B-Hum/B-Sci needs an explicit table of these strings.
  - One transient network failure (ENGL 330 sections, 2025 spring: "fetch failed" after 3 retries). A resumed run fetched it; 0 failures remain.
  - `fetched_at` in the manifest is the UTC date.
- Department notes can contain contact emails (PHIL's `departmentalUgradNotes` names a department address).
- Dates in `courseSchedule` are Java-style strings (`"Wed Sep 09 00:00:00 PDT 2026"`), not ISO.
- `registrarNotes` is HTML with boilerplate shared by every course.

## What `npm run data:fetch` saves, and what it strips

Implemented in `scripts/lib/outlines/strip.ts`; tested in `tests/scripts/outlines.test.ts`. Only the outline (not the course or section lists) carries person data.

**Removed from every outline before it is written:**

- Top-level `instructor` (name, commonName, firstName, lastName, email, phone, office, officeHours, profileUrl, roleCode): people.
- Top-level `grades` (grading scheme), `requiredText` and `recommendedText` (textbooks), `courseSchedule` (class schedule), `examSchedule` (exam schedule).
- `info.gradingNotes` (grading), `info.requiredReadingNotes` and `info.materials` (textbooks and materials).
- `info.courseDetails` and `info.educationalGoals`: one instructor's syllabus for one section, not course-level data, and free text that can mention people.
- Any key not in the lists above (top-level or in `info`): dropped and reported as unexpected in the run summary and `_manifest.json`, so a human can decide.

**Kept (`info` only):** `title`, `units`, `prerequisites`, `corequisites`, `designation`, `description`, `dept`, `number`, `degreeLevel`, `deliveryMethod`, `notes`, `departmentalUgradNotes`, `registrarNotes`, `specialTopic`, `type`, `requirements`, `shortNote`, plus where it came from: `term`, `section`, `name`, `classNumber`, `outlinePath`. Values are stored exactly as returned (`designation` is not mapped to W/Q/B), except:

- Emails in kept text become `[email removed]`, phone numbers `[phone removed]`. This applies to every kept string, including strings nested inside arrays or objects.
- The section's instructor names (full name, first, last, common name), if they appear in kept text, become `[name removed]`. Matching is case-sensitive and whole-word, so "will" survives an instructor named Will.

## Section lists are not committed

`{number}.sections.json` files are a local cache (gitignored since 2026-10-04). What the app needs from them is kept in git: `_manifest.json` records, per course, the section types (`LEC`, `TUT`, ...) for every term with at least one section (`courses[code].sections`), and `npm run data:build` turns that into `data/generated/offerings.json`. On a fresh clone the section files are absent, so a non-dry `npm run data:fetch` re-requests them (about 1,600 requests); `npm run data:build` does not need them.

## Generated course data (`npm run data:build`)

- `data/generated/courses.json`: one record per outline with `title`, `units` (number, or null when the outline has no units field), `level` (hundreds of the course number), `department`, raw `prerequisites_text`, `corequisites_text`, `requirements_text` (`info.requirements`), `short_note` (`info.shortNote`), `description`, `designations`, `designation_raw`, `source_term`. Schema: `src/lib/data/catalog.ts`.
- `designations` come from the explicit table in `scripts/lib/designations.ts`: `"N/A"` and `""` mean none; `Writing` W; `Quantitative` Q; `Breadth-Social Sciences` / `Breadth-Soc` / `Breadth-Social Sci` B-Soc; `Breadth-Humanities` / `Breadth-Hum` B-Hum; `Breadth-Science` B-Sci. After a `Breadth-...` part, the abbreviations `Social Sciences`, `Social Sci`, `Humanities`, and `Science` name further breadths (`"Breadth-Hum/Social Sci/Science"` is B-Hum, B-Soc, B-Sci). Any other string fails the build.
- `data/generated/offerings.json`: `{ "BUS 303": { "2025-fall": ["LEC"], ..., "future": { "2027-spring": ["LEC"] } } }`. A term is listed only if the course had at least one section of any type; scheduled terms after the last fetched past term sit under `future`.
- `data/generated/unknown-courses.json`: requirements.csv courses with no outline in the fetched terms ("offering unknown"), with the req_ids that name them. The build fails if a requirements.csv course is neither in `courses.json` nor reported as without data by the fetch manifest.

## Courses we don't have data for

Only the default departments (`scripts/outlines.config.json`) are fetched whole; other departments contribute only the course codes listed in `data/sheets/requirements.csv`. Any other course code (an elective a student types in, for example) has no outline. **The app should treat unknown codes as unverified electives**: show them, count units only if the student confirms them, and never invent a title, units, prerequisites, or designation for them.
