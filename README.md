# myAdvisor

myAdvisor is a degree planner for SFU Beedie BBA students: it audits completed courses against the Fall 2026 calendar, builds a 4-year plan that flags rule breaks, and answers questions like "do I still need BUS 393?" with calendar citations. Every fact comes from a tested rules engine; the AI chat only explains the engine's answers.

## Run locally

Requires Node 24 (see `.nvmrc`).

```bash
git clone https://github.com/swishpaul23/myadvisor.git
cd myadvisor
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

`.env.local` values: `ANTHROPIC_API_KEY` (Claude API key), `ANTHROPIC_MODEL` (default given), `DATABASE_URL` (optional; without it the app uses the JSON snapshot in `data/generated/`), `CONTACT_EMAIL` (sent to SFU's API so they can reach us).

Run `npm run check` (lint, typecheck, tests) before committing. See `CLAUDE.md` for architecture and the data contract.

## For my teammate

You don't need git or code. You fill in the Google Sheet; Stuart moves the files into the project.

1. **Templates.** The column headers are in `data/sheets/` (Stuart will share them): `requirements.csv` (program rules), `test-questions.csv` (questions with known answers), `prereq-overrides.csv` (prerequisites the app can't read on its own). Make one Google Sheet tab per file and paste the header row into row 1 exactly as given.
2. **Filling rows.** Copy what the SFU Fall 2026 calendar says, paste the calendar page URL into `source_url`, and leave `status` as `beta`. If you're not sure about something, write "unsure" in `notes` instead of guessing.
3. **Exporting.** Open the tab, then **File → Download → Comma-separated values (.csv)**. This downloads only the tab you're looking at, so repeat it for each tab. Keep the file names `requirements.csv`, `test-questions.csv`, `prereq-overrides.csv`.
4. **Handing off.** Send the CSV files to Stuart, who drops them into `data/sheets/` and runs the data build. It reports any rows it can't use, with the reason.

## Product plan

The team's product and implementation plan (from `main`). Sections marked planned are not built yet; see above for what runs today.

An academic advisor app being built for [StormHacks 2026](https://stormhacks2026.devpost.com/). (Hackathon Project)

MyAdvisor will help students understand their degree progress, choose courses, and plan their next semester using their confirmed academic record and official university requirements. Students will be able to ask questions through text or voice and see the reasoning and sources behind the advice.

### The problem

Academic planning requires students to combine their transcript, program requirements, concentration rules, prerequisites, and personal goals. That information is spread across calendars and other university resources. A course choice can affect several requirements and later semesters, making it difficult to understand what to take next.

We want students to answer three questions in one place:

- Where do I stand in my degree?
- What can I take next, and why?
- How would a different course load or course choice change my plan?
- and much more features

### Initial scope

The first version will focus on **Simon Fraser University’s Bachelor of Business Administration**, using **Fall 2026** requirements. The initial demo student will be in **Finance**.

The requirements dataset also covers Accounting, Innovation and Entrepreneurship, Human Resource Management, International Business, Management Information Systems, Marketing, Operations Management, and Strategic Analysis.

Supporting additional universities, degrees, and requirement terms is a future expansion. Each needs its own verified sources and rules before MyAdvisor can provide a complete degree audit.

### Planned student experience

```mermaid
flowchart TD
    A[Sign up or sign in] --> B[Confirm academic profile]
    B --> C[Upload transcript or enter courses]
    C --> D[Review and confirm coursework]
    D --> E[View degree progress]
    E --> E[Standard questions part of the UI]
    F --> F[Ask advisor by text or voice]
    G --> G[Review and edit semester plan]
    H --> H[Save plan]
    I --> F
```

1. **Sign in and set up a profile.** Confirm the university, program, concentration, applicable requirement term, admission pathway, target semester and preferred course load.
2. **Add an academic record.** Upload a transcript PDF or enter courses manually.
3. **Review extracted information.** Correct course codes, credits, grades and terms before confirming the record. Completed, in-progress and transfer coursework remain distinct.
4. **See degree progress.** Review completed requirements, remaining gaps and unresolved items. Open a requirement to inspect the matching courses and its official source. Then Standard questions by UI
5. **Ask for advice.** Ask questions such as “What should I take next term?”, “Can I take this course?” or “What changes if I take fewer courses?”
6. **Build and save a plan.** Review suggested courses, understand eligibility and warnings, make changes, and explicitly save the semester plan.

Returning students will go to their overview or resume unfinished setup. The proposed main navigation is **Overview**, **Advisor**, **My plan**, and **Academic record**.

### Planned features

| Feature | Intended behavior |
| --- | --- |
| Accounts and profiles | Persist each student’s academic context and isolate their records. Application login is the initial proposal; official SFU SSO remains a separate integration decision. |
| Transcript upload | Use Gemini to extract structured coursework from PDFs, with an editable review step before the data informs advice. |
| Degree audit | Evaluate core, concentration, Beedie and WQB requirements against confirmed coursework. |
| Prerequisite checks | Explain eligible, conditionally eligible, blocked and unresolved courses using curated prerequisite data. |
| Personalised academic chat | Combine student context, computed results and official source material in Gemini answers. |
| Voice advising | Use ElevenLabs for spoken answers, with speech-to-text for spoken questions. Keep readable text alongside audio. |
| Semester planning | Recommend, edit and persist course selections with credit totals and requirement coverage. |
| What-if comparisons | Explore different course loads or course sequences with visible assumptions. |
| History | Reopen saved plans and conversations; recheck plans when the confirmed record changes. |

Later features may include institution-specific GPA scenarios, graduation estimates, sourced deadlines, calendar export, co-op and scholarship guidance, and a summary to bring to a human advisor. These follow the first working transcript-to-plan journey. and much more

### Technology choices

| Layer | Technology | Status and intended role |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/Base UI | Present in the scaffold; application screens still need implementation. |
| Main LLM | Gemini through the Vercel AI SDK (`ai`, `@ai-sdk/google`) | Model `gemini-2.5-flash`. Calls stay in server route handlers or `src/lib/ai/google.ts`. The browser never sees the key. |
| Application database | Snowflake Postgres | Selected for profiles, confirmed course attempts, requirements, plans and conversation history. Instance, schema and connection are pending. |
| Voice | ElevenLabs API | Selected for spoken advising; voice choice and input/output integration are pending. |
| Backend | Authenticated API/orchestrator | Planned. FastAPI on AWS Lambda is an option in the team sketch; framework and deployment are not final. |
| Transcript files | Private object storage | Planned. Storage provider and retention policy are pending. |
| Source retrieval | Calendar retrieval, with Snowflake Cortex Search REST API as a proposed option | Search service, source ingestion and track fit still need confirmation. |
| Public site | A .tech domain | Planned for the deployed demo; domain name and hosting are not selected. |

**Snowflake Postgres and the Snowflake REST API have different roles.** The application will connect to Snowflake Postgres using a PostgreSQL connection through the backend. Snowflake documents standard PostgreSQL clients and requires SSL connections. A Snowflake AI/search REST integration would be a separate service call, not the application database connection. [Snowflake Postgres connection documentation](https://docs.snowflake.com/en/user-guide/snowflake-postgres/connecting-to-snowflakepg).

Gemini is the selected main LLM. The earlier handwritten sketch’s Claude label is superseded by this choice.

### Proposed architecture

```mermaid
flowchart TD
    Student[Student] --> Web[Next.js frontend]
    Web --> API[Authenticated backend orchestrator]
    API --> PG[Snowflake Postgres]
    API --> Files[Private transcript storage]
    API --> Rules[Requirements and prerequisite evaluator]
    Rules --> PG
    API --> Retrieval[Official-source retrieval]
    Calendar[Public SFU calendar sources] --> Retrieval
    API --> Gemini[Gemini API]
    API --> Voice[ElevenLabs API]
```

The backend will resolve the authenticated student’s record, run requirement and prerequisite checks, retrieve relevant source material, and give those results to Gemini for explanation. API keys and database access will stay on the server.

If Cortex Search is adopted, public calendar excerpts will need to be loaded into a Snowflake search service and queried through its REST endpoint. This is additional setup; the app will not assume that Cortex Search automatically indexes its Postgres tables. [Cortex Search API documentation](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search/query-cortex-search-service).

### Academic data and advising behavior

[data/sheets/requirements.csv](data/sheets/requirements.csv) uses these fields (full contract in [CLAUDE.md](CLAUDE.md) section 6):

```text
req_id, program, concentration, catalog_term, group, rule, n_or_units,
courses, level_min, level_max, designation, filter, min_grade, notes,
source_url, status, verified_by
```

The planned database will hold student profiles, transcript metadata, confirmed course attempts, versioned requirements and sources, course/prerequisite data, saved plans, and conversations. Original transcript files will live in private file storage, with database references to them.

Important implementation requirements:

- **Compute academic rules in code.** Credit totals, prerequisites and requirement allocation come from an evaluator; Gemini explains the results.
- **Use confirmed records.** Extraction is a proposal until the student reviews it. In-progress courses do not count as already completed.
- **Preserve exceptions.** P-graded courses, transfer equivalencies, selected-topics courses, residency rules and WQB allocation need explicit handling.
- **Show evidence.** Advice should cite the applicable calendar sources and distinguish verified facts from assumptions or unresolved information.
- **Reconcile record updates.** A replacement transcript should not duplicate course attempts, and affected plans should be rechecked.
- **Keep data scoped to its owner.** Account isolation must apply to records, files, plans and conversation context.
- **Make course availability explicit.** An academic recommendation does not establish section availability, available seats or timetable compatibility. Saving a plan does not enrol the student.

The requirements CSV is a curated starting point, not an executable rules engine. Its descriptive filters and rule vocabulary still need an agreed schema, validated import and meaningful tests. Course prerequisites need separate curation.

### Hackathon tracks we intend to target

These are intended entries, not completed integrations or confirmed eligibility. The [official StormHacks prize page](https://stormhacks2026.devpost.com/#prizes) is the source for the track names and descriptions.

| Track | Planned project use | Remaining work |
| --- | --- | --- |
| Best Use of Snowflake API | Snowflake Postgres for application data; proposed Snowflake REST-based retrieval for sourced advising. | Confirm the qualifying API use with organisers, provision services, and demonstrate an actual API-backed feature. |
| Best Use of Gemini API | Transcript extraction and personalised academic explanations using the Gemini API. | Implement the calls, validate extracted records, and demonstrate grounded responses. |
| Best Use of ElevenLabs | Spoken academic advice and voice interaction tied to the same student context as text chat. | Implement and demonstrate the voice experience. |
| Best .Tech Domain Name | Choose a .tech name that fits MyAdvisor and use it for the deployed project. | Select/register the domain, configure deployment and verify any additional track instructions. |

The published Snowflake track description emphasises AI through Snowflake’s REST API. **We should not assume that using Snowflake Postgres alone establishes eligibility.** Cortex Search is a proposed way to add an API-backed advising feature; its eligibility has not been confirmed. [Track description](https://stormhacks2026.devpost.com/#prizes).

The event requires a project link, a demo video of at most three minutes, and explicit opt-in to each selected track. These submission items still need to be prepared. [Submission requirements](https://stormhacks2026.devpost.com/).

### Development setup

These commands run the **current frontend scaffold**, not the planned advisor integrations.

```bash
git clone git@github.com:swishpaul23/myadvisor.git
cd myadvisor
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The current homepage is `src/app/page.tsx`.

Available scripts:

```bash
npm run dev    # Development server
npm run lint   # ESLint
npm run build  # Production build
npm run start  # Serve an existing production build
```

There is no project test script yet. Consult [package.json](package.json) and the committed lockfile for exact dependency versions.

#### Configuration to add during implementation

Put the Gemini key in `.env.local` for local calls:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-api-key
```

Get the key at [Google AI Studio](https://aistudio.google.com/apikey). The name must not start with `NEXT_PUBLIC_`. Routes read it per request, so a production build does not need the key. Other integrations (Postgres, ElevenLabs, auth, private storage, Snowflake REST) still need their own server-side settings when those features are implemented.

Keep credentials out of source control and browser bundles. Use environment configuration for local development and the deployment platform’s secret storage when hosting the app.

### Build order and demo goal

1. Implement accounts, profile persistence and resumable onboarding.
2. Connect Snowflake Postgres and import validated academic rules.
3. Build transcript/manual entry, extraction review and confirmed coursework.
4. Implement deterministic degree progress and prerequisite checks.
5. Add Gemini advising with relevant source retrieval.
6. Build an editable planner and persistent saved plans.
7. Add ElevenLabs voice, the qualifying Snowflake API feature, and the .tech deployment.
8. Verify the end-to-end journey and prepare the track submissions.

The intended demo follows a Finance student who uploads a synthetic transcript, corrects an extraction issue, discovers an outstanding requirement or prerequisite gap, asks for a manageable next-term plan, edits a recommendation, hears the explanation and saves the plan. Reloading should show the same saved plan.

### Decisions still open

- Authentication provider and whether official SFU SSO is available.
- Backend framework, hosting and private file storage.
- ElevenLabs voice and voice interaction mode. Gemini model is `gemini-2.5-flash` through the Vercel AI SDK.
- Snowflake account/instance access and the qualifying Snowflake REST feature.
- Requirement evaluator format, prerequisite coverage and exception handling.
- Live course-offering data and the limits of graduation estimates.
- .tech domain name and deployment configuration.

### References

- [Proposed user flow](docs/user-flow.md)
- [SFU Fall 2026 BBA calendar](https://www.sfu.ca/students/calendar/2026/fall/programs/business/major/bachelor-of-business-administration.html)
- [SFU Fall 2026 WQB requirements](https://www.sfu.ca/students/calendar/2026/fall/fees-and-regulations/enrolment/WQB.html)
- [Gemini PDF understanding](https://ai.google.dev/gemini-api/docs/document-processing)
- [ElevenLabs text-to-speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [ElevenLabs speech-to-text](https://elevenlabs.io/docs/overview/capabilities/speech-to-text)
- [StormHacks tracks and prizes](https://stormhacks2026.devpost.com/#prizes)
