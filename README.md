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
