# myAdvisor

Also read [README.md](README.md) (setup, and the team's product plan), [docs/user-flow.md](docs/user-flow.md) (proposed student journey) and [AGENTS.md](AGENTS.md) (shared agent rules, loaded below).

## 1. The architecture rule

**Code computes every fact. The LLM only explains.** The rules engine (audit, prerequisite checks, plan validator, plan generator) is plain, deterministic TypeScript with unit tests. The chat model calls the engine through tools and explains the results with citations. It never states a requirement, prerequisite, or grade rule on its own. If the engine can't decide, the answer is "unknown, check with an advisor", never a guess.

## 2. Product

myAdvisor is a degree planner for SFU Beedie BBA students, built at a 24-hour hackathon by Stuart (code) and a non-technical teammate (requirement data, test questions, design, pitch). Demo flow: (1) fill in a setup form and add completed courses; (2) see a degree audit with progress bars per requirement; (3) generate a 4-year plan grid, drag courses between terms, and see rule breaks flagged in red; (4) ask the chat "do I still need BUS 393?" and get an answer citing the SFU calendar; (5) if time allows, elective suggestions and a sample transcript upload.

## 3. Scope

- In: Beedie BBA major and all 9 concentrations (Accounting, Innovation and Entrepreneurship, Finance, Human Resource Management, International Business, Management Information Systems, Marketing, Operations Management, Strategic Analysis), on the SFU Fall 2026 calendar (`catalog_term` = `2026-fall`). Finance is the demo program. The demo student is fictional.
- Sign-in: Google via Auth.js (next-auth v5), JWT sessions, no database adapter; see README "Auth setup". Decided by Stuart, 2026-10-04.
- Cut: SFU SSO, saved plans beyond the demo, other programs or calendars, joint majors, honours, other faculties.

## 4. Folder map

```
data/sheets/         CSVs exported from the teammate's Google Sheet (source of truth for rules)
data/raw/outlines/   saved SFU Course Outlines API responses (committed, never hand-edited)
data/policy/sfu.json SFU-wide counting policies (grade points, repeats, CR, WQB)
data/sources/        reference PDFs, gitignored
data/generated/      JSON snapshot built by scripts, never hand-edited
db/migrations/       numbered plain .sql files
docs/decisions.md    architecture decisions
scripts/             fetch-outlines.ts, build-data.ts, db-migrate.ts (run with tsx)
src/app/             Next.js routes and API handlers only, kept thin
src/components/      React UI (shadcn in components/ui)
src/engine/          pure TypeScript rules engine
src/lib/llm/         Claude client and tool definitions (server-only)
src/lib/data/        loads reference data into typed objects
src/lib/db/          Postgres access (server-only)
tests/engine/        engine unit tests
tests/golden/        teammate's test questions as expected-answer cases
```

**Engine purity:** `src/engine/**` may not import `react`, `next`, `pg`, `@/components`, `@/app`, `@/lib/llm`, `@/lib/db`, or `fs`/`path`/`http`. ESLint enforces it; `tests/engine/purity.test.ts` proves the rule fires. Data comes in as arguments, results go out as return values. Never silence the rule; move the import out of the engine. Files in `src/lib/llm` and `src/lib/db` start with `import "server-only";`.

## 5. Data flow

1. Teammate's Google Sheet → CSV exports in `data/sheets/`.
2. SFU Course Outlines API → `data/raw/outlines/{year}/{term}/{dept}/{course}.json` (`npm run data:fetch`).
3. `npm run data:build` validates CSVs + outlines + `data/policy/sfu.json`, writes JSON to `data/generated/`, and loads Postgres when `DATABASE_URL` is set.
4. The app reads Postgres, falling back to the JSON snapshot if the database is unreachable.
5. The engine receives reference data loaded into memory once and never touches the database.

## 6. Data contract

`data/sheets/requirements.csv`:
`req_id,program,concentration,catalog_term,group,rule,n_or_units,courses,level_min,level_max,designation,filter,min_grade,notes,source_url,status,verified_by`

- `req_id`: unique and stable; never renamed once code or tests depend on it. Used for audit output, links between rows, chat citations, and golden tests.
- `program`: `BBA`, or `*` for university-wide rules.
- `concentration`: blank (applies to all concentrations) or exactly one of `Accounting`, `Finance`, `Human Resource Management`, `Innovation and Entrepreneurship`, `International Business`, `Management Information Systems`, `Marketing`, `Operations Management`, `Strategic Analysis`.
- `group`: `Lower core | Upper core | Concentration | Beedie | University`
- `rule` (in-scope rows): `one course | n courses | all of | units from | minimum GPA | minimum grade | completed concentrations | maximum breadth allocations per course`
- `courses`: comma-separated list inside quotes, e.g. `"BUS 312,BUS 315"`.
- `level_min` / `level_max`: integers, a course-number range (upper division = 300 to 499, lower = 100 to 299). Blank means no level restriction.
- `designation`: blank, or one or more of `W`, `Q`, `B-Soc`, `B-Hum`, `B-Sci` joined with `|`. A course counts only if it carries one of these.
- `filter` (in-scope rows): semicolon-separated leftovers only. Allowed terms so far: `dept X` or `dept X,Y`, `dept not in X,Y`, `subject business`, `subject outside major`, `subject in major`, `outside Beedie`, `institution SFU`, `course_units >= N`, `earned_units >= N`, `exclude CODE|CODE|...`, `purpose graduation`, `purpose entry_to_300_400_BUS`, `degree first_bachelors`, `program courses` (the BUS courses matched to Lower core, Upper core and declared-concentration slot rows; P excluded, repeats use the higher grade, a course in two rows counts once; rule decided by Stuart 2026-10-04, ASSUMPTION: not yet confirmed against the calendar, so `gpa-program`/`gpa-program-ud` stay `beta`), `all courses`, `if institution SFU then course_units >= N`, `group X|Y` (restricts the rule to requirement rows in those `group` values), `from_reqs ID|ID` (the course list is the union of those rows' course lists; `data:build` fails if any ID doesn't exist), `within ID` (this row is a subset of row ID: its courses must also count toward ID, solved in the same matching, never as extra courses; at most one per row; `data:build` fails if ID doesn't exist or is the row itself). Also accepted as already handled: `level upper|lower|NNN` and `not allocated to designated breadth`. Anything else is reported by `data:build`, never guessed at or rewritten.
- `min_grade`: blank, a letter grade (`A+` to `D`), or `P`.
- `status`: `beta | verified | out-of-scope`. Everything starts `beta`; only Stuart marks rows `verified`. Rows with status `out-of-scope` are skipped by the engine; `data:build` skips their `rule` and `filter` checks (any string allowed) but checks every other column.
- `verified_by`: a person's name; blank until a human checks the row. Required when `verified`, must be blank when `beta`.

Schema: `src/lib/data/schema.ts` (zod). `npm run data:build` fails with sheet row and `req_id` on any bad value or duplicate `req_id`, and writes `data/generated/requirements.json`.

`data/sheets/test-questions.csv`: `question,type,expected_answer,source_url,app_answer,correct` (`type`: `need course | prereq | plan`).
`data/sheets/prereq-overrides.csv`: `course_code,override_text,reason,source_url,override_json` for prerequisites the parser can't handle. `override_json` is the prerequisite tree in the prereqs.json node format (or `null` for none), validated by zod; `data:build` replaces the parsed tree, marks the record `source: "override"`, and fails on an invalid tree or a `course_code` not in courses.json.
There is no courses CSV: course data comes from the SFU Course Outlines API.

**Prerequisites** (`data/generated/prereqs.json`, parsed deterministically by `scripts/lib/prereqs/`, schema `src/lib/data/prereqs.ts`): per course, `prereq` and `coreq` trees of `course` (code, `minGrade`, `concurrentOk`), `all`, `any`, `units`, `count` (n courses of a subject and level), `permission` (who: instructor, department, or co-op coordinator), `restriction` (program or admission rule), `alt_group` (an "or" alternative for another student group, e.g. "OR data science majors with ..."), `external` (`kind: "high_school"`, e.g. "Pre-Calculus 12 (or equivalent) with a grade of at least B", with `minGrade` when stated), and `unknown` nodes, plus `status` (`parsed | partial | unparsed | none`, counting only unknown nodes) and `source` (`parsed | override`). Text the parser can't map to an exact pattern is an `unknown` node holding the original words; `advisory` holds recommendations, which are never requirements. `prereqs-review.json` lists every partial or unparsed course; `prereqs-review-requirements.json` only those named in requirements.csv.
**Engine rules for prerequisite nodes:**

- `count`: evaluate from completed courses when `subject` and `level` are explicit (e.g. two ENGL courses numbered 200-299); otherwise "cannot verify, check with an advisor".
- `permission`: "not verifiable, may be waived by permission"; never report it as met.
- `alt_group` inside an `any`: evaluate the other alternatives and attach a note that an alternative route exists for another student group (`group`). Never count the alt_group itself as satisfied.
- `external`: needs a declared answer from the student (setup form, later). Without one, the result is "cannot verify".
- `restriction` and `unknown`: "cannot verify, check with an advisor". If a tree contains either, the engine must not report the prerequisite as met or not met (it may show which parsed parts are satisfied): the text can be an extra requirement or an alternative path, so neither answer is safe.

**Rule for every row:** copy what the calendar says, include its URL, and write "unsure" in `notes` rather than guess.

## 7. Database

- Standard Postgres only (target is Snowflake Postgres or Supabase/Neon, undecided). Plain SQL migrations with `pg`.
- Reference tables (`courses`, `course_offerings`, `course_prereqs`, `requirements`, `requirement_courses`) are rebuilt from files by `data:build`, never edited by hand.
- Student tables (`students`, `student_courses`, `plans`, `plan_courses`, `chat_messages`, `feedback`) are written by the app.
- No real student data. No transcript files stored.

## 8. Commands

```
npm run dev          start the dev server
npm run build        production build
npm run lint         ESLint (includes engine purity rule)
npm run typecheck    next typegen + tsc --noEmit
npm run test         Vitest once (test:watch for watch mode)
npm run format       Prettier write
npm run check        lint, typecheck, test; fails fast. Run before calling a task done.
npm run data:fetch   fetch SFU Course Outlines (network; ask before running)
npm run data:build   CSVs + outlines -> data/generated/ (+ Postgres if DATABASE_URL)
npm run db:migrate   apply db/migrations (touches the database; ask before running)
```

Node 24 (`.nvmrc`). Skills: `/check`, `/data-sync`.

## 9. Working rules

- Never invent a requirement, prerequisite, grade rule, or course code. Return "unknown" and flag it.
- Every engine function gets unit tests in `tests/engine/`.
- Run `npm run check` before calling a task done.
- Small commits. No new dependencies without asking Stuart.
- API handlers stay thin: validate input with zod, call the engine, return.
- The demo student is fictional. Never log request bodies that contain grades.
- `CONTACT_EMAIL` comes from the environment; never hard-code an email address.

## 10. Known program facts to verify (all `beta`)

From the Beedie advising checklist for Fall 2025 to Summer 2026, an older term: a cross-check, not truth. Verify each against the Fall 2026 calendar before encoding it.

- 120 units total; 45 upper-division units, at least 36 of them BUS.
- Six GPA gates: cumulative 2.00, cumulative upper-division 2.00, upper-division BUS 2.00, overall SFU BUS 2.30, SFU program 2.00, SFU upper-division program 2.00.
- C- minimum in lower-division and upper-division requirements and in the Business Foundation Pathway.
- Business Foundation Pathway: BUS 201 (direct entry) or BUS 202 (transfer). Professional Development Series, pass required: BUS 203, 300, 496.
- 36 units outside BUS. Group A: 6 units (Global Perspectives, Innovation, Social Responsibility). Group B: 3 units with an Indigenous perspective.
- Three 400-level BUS courses, at least one at SFU, not counting BUS 425, 478, 496.
- One of an approved list of Global Perspectives upper-division BUS courses.
- At least one concentration, following the requirements in the term it was declared.
- Sources: https://www.sfu.ca/students/calendar/2026/fall/programs/business/major/bachelor-of-business-administration.html and https://www.sfu.ca/beedie/programs/undergraduate/bba-major/curriculum.html

@AGENTS.md
