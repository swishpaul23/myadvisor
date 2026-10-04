# MyAdvisor
(Hackathon Project)
StormHacks 2026 academic advisor for degree progress, course choice, and next-semester planning. Students ask by text or voice and see the reasoning and sources behind the advice.

**Read [README.md](README.md) before making changes.** It is the product and implementation plan. [docs/user-flow.md](docs/user-flow.md) is the proposed student journey.

**Status: the rules engine and data pipeline are built; the student-facing advisor is not.** Built: degree audit, prerequisite evaluator and plan validator (`src/engine`, unit-tested), the requirements and course-data pipeline (`data/sheets` → `data/generated`), and a server-side Snowflake data layer (`src/lib/data`). Google sign-in is built (Auth.js, `src/auth.ts`, `src/proxy.ts`). Advisor voice is built: push-to-talk through ElevenLabs (`src/lib/ai/elevenlabs.ts`, `/api/advisor/transcribe`, `/api/advisor/speak`), hidden when `ELEVENLABS_API_KEY` is missing. Not built: account and profile persistence, transcripts, the planner UI, advising chat, and deployment. Do not describe or build as if those exist. Gemini is only the server client in `src/lib/ai/google.ts`.

## Scope

First version: **Simon Fraser University Bachelor of Business Administration**, **Fall 2026** requirements. Demo student: **Finance**.

[data/sheets/requirements.csv](data/sheets/requirements.csv) also covers Accounting, Innovation and Entrepreneurship, Human Resource Management, International Business, Management Information Systems, Marketing, Operations Management, and Strategic Analysis (96 source-referenced rows, 90 in scope: BBA core, concentrations, Beedie, and university/WQB). `npm run data:build` validates and imports it, and the audit engine evaluates it with unit tests; every row is still `beta` (none verified). Do not use it for advice until rule encoding, exceptions, import, and tests are agreed. Prerequisites need separate curation: they are parsed from the SFU course outlines into `data/generated/prereqs.json`, with hand corrections in `data/sheets/prereq-overrides.csv`.

Other universities, degrees, and requirement terms are out of scope until each has verified sources and rules.

## What is in the repo

| Present | Not built |
| --- | --- |
| Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/Base UI. Homepage `src/app/page.tsx` is still starter content (plus a badge showing the data source). Gemini client: `src/lib/ai/google.ts` using the Vercel AI SDK and `gemini-2.5-flash`. Rules engine in `src/engine` (degree audit, prerequisite evaluator, plan validator) with Vitest tests. Data pipeline: SFU Course Outlines fetch, requirements CSV validation, prerequisite parser. Snowflake reference-data tables in `myadvisor.app`, read by `src/lib/data`. | Auth, Postgres application database (`db/migrations` has no migrations yet), transcript processing, planner UI, advising chat, private file storage, deployment, .tech domain. |

Scripts: `npm ci`, `npm run dev` (http://localhost:3000), `npm run lint`, `npm run build`, `npm run start`, `npm run test` (Vitest), `npm run check` (lint, typecheck, tests), `npm run data:build`, `npm run data:parity`. Full list in [CLAUDE.md](CLAUDE.md) section 8.

## Architecture

```text
Student → Next.js → authenticated backend orchestrator
  → Snowflake Postgres (profiles, confirmed attempts, requirements, plans, conversations)
  → private transcript storage
  → requirements and prerequisite evaluator
  → official-source retrieval (public SFU calendar; Cortex Search REST is only a proposal)
  → Gemini API (explanations)
  → ElevenLabs API (voice)
```

- **Gemini is the main LLM**, called only through the Vercel AI SDK (`ai` and `@ai-sdk/google`) from server route handlers or `src/lib/ai/google.ts`. Model: `gemini-2.5-flash`. Do not call the Gemini REST API, `@google/genai`, or `@google/generative-ai`. Structured JSON uses `generateText` with `Output.object` and `jsonSchema`, then a hand-written type guard. Plain text uses `generateText`. Streaming chat uses `streamText` and `toUIMessageStreamResponse`. Tool loops use `tool`, `jsonSchema`, and `stopWhen: stepCountIs(n)`. Read `GOOGLE_GENERATIVE_AI_API_KEY` at request time. If it is missing, return HTTP 500 with `{ error: "Missing GOOGLE_GENERATIVE_AI_API_KEY." }` before calling the model. On model failure, timeout, or bad output, return the deterministic fallback instead of throwing.
- **Snowflake Postgres is the application database**, reached with a PostgreSQL client over SSL through the backend. A Snowflake AI/search REST call is a separate service. Postgres use alone does not satisfy the Snowflake REST API track, and Cortex Search does not index these Postgres tables automatically.
- Current state (separate from the Postgres plan above): reference data (courses, prerequisites, requirements, offerings, `calendar_chunks`) is loaded into Snowflake tables in `myadvisor.app` by `scripts/load-snowflake.mjs` and `scripts/build-search.mjs`, and read with `snowflake-sdk` (key-pair auth) in `src/lib/data/snowflake.ts` behind `DATA_SOURCE=json|snowflake`, with the `data/generated/` JSON snapshot as fallback. Calendar search is plain SQL `ILIKE`; Cortex Search and `EMBED` are blocked on the current trial account.
- Backend framework and host are undecided. FastAPI on AWS Lambda is an option in the team sketch, not a decision.
- API keys, database access, and storage credentials stay on the server. Never commit secrets or put them in client bundles. Gemini uses `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`. Do not prefix it with `NEXT_PUBLIC_`.

## Advising rules

- **Compute academic rules in code.** Credit totals, prerequisites, and requirement allocation come from an evaluator. Gemini explains those results; it does not decide them.
- **Use confirmed records.** Extraction is a proposal until the student reviews course codes, credits, grades, and terms. Completed, in-progress, and transfer coursework stay distinct. In-progress courses do not count as completed.
- **Preserve exceptions.** P-graded courses, transfer equivalencies, selected-topics courses, residency, and WQB allocation need explicit handling. Do not treat recognition of a course as approval of a transfer equivalency.
- **Show evidence.** Cite the applicable calendar source. Separate verified facts from assumptions and unresolved items. If calendar coverage is missing, do not claim a complete audit.
- **Reconcile updates.** A replacement transcript must not duplicate course attempts. Recheck affected plans and show what changed.
- **Scope data to its owner.** Records, files, plans, and conversation context belong to that account.
- **A recommendation is not enrolment.** Do not imply section availability, seats, or timetable fit until live offering data exists. Saving a plan does not enrol the student.
- Requirement term, admission pathway, and concentration are confirmed profile fields, not guesses from the student’s year.
- Application login is the initial proposal. Do not label sign-in as SFU SSO unless that integration exists. An SFU email is not access to a university record. Demo data must be a clearly labelled sample, never presented as someone’s uploaded transcript.

Navigation, once built: **Overview**, **Advisor**, **My plan**, **Academic record**. Text and voice share one conversation and academic context. Keep a readable answer beside audio, and keep text usable if voice fails.

## Build order

1. Accounts, profile persistence, and resumable onboarding.
2. Snowflake Postgres, then a validated import of academic rules.
3. Transcript or manual entry, extraction review, and confirmed coursework.
4. Deterministic degree progress and prerequisite checks.
5. Gemini advising with relevant source retrieval.
6. Editable planner and persistent saved plans.
7. ElevenLabs voice, the qualifying Snowflake API feature, and the .tech deployment.
8. End-to-end check and track submission materials.

Demo: a Finance student uploads a synthetic transcript, corrects an extraction issue, sees a gap, asks for a manageable next-term plan, edits a recommendation, hears the explanation, and saves the plan. Reload shows the same saved plan.

## Decisions still open

Do not lock these in without an explicit decision: SFU SSO (the auth provider is decided: Google sign-in via Auth.js (decided by Stuart, 2026-10-04)), backend framework and hosting, private file storage, ElevenLabs voice choice (push-to-talk is the interaction mode), Snowflake instance and the qualifying REST feature, evaluator schema and exception handling, live offerings and graduation estimates, .tech domain and deployment. Gemini is `gemini-2.5-flash` through the Vercel AI SDK.

If a product, status, or architecture decision changes, update [README.md](README.md) and keep this file aligned with it.

## Light review after a feature

After an agent implements a feature, run one light read-only review before calling it done. Skip small changes: typos, copy, comments, renames, formatting, one-line fixes, and config tweaks.

Pass the request, the files touched, and the diff. Fix findings that make the feature wrong, incomplete, or unsafe. Do not restyle from review comments. Do not review that follow-up fix again unless the fix is itself a new feature.

| Tool | When | Subagent | Model |
| --- | --- | --- | --- |
| Cursor | Any feature that is not small | `light-reviewer` | Grok 4.7 |
| Claude | Any feature that is not small | `light-reviewer` | Claude Sonnet 5.5 |
| Codex | Big: new flow, subsystem, cross-cutting integration, or a wide multi-file change | `light_reviewer` | GPT-6.1 Sol |
| Codex | Medium: one screen, one endpoint, or one cohesive module | `light_reviewer_luna` | GPT-6 Luna |

Definitions live in `.cursor/agents/light-reviewer.md`, `.claude/agents/light-reviewer.md`, and `.codex/agents/`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
