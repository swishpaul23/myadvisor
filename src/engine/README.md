# src/engine

Pure, deterministic TypeScript rules engine: degree audit, prerequisite checks, plan validator, plan generator.
Data in as arguments, results out as return values. No React, Next, database, LLM, or Node I/O imports (enforced by ESLint).
Every function has unit tests in `tests/engine/`. When a rule can't be decided, return "unknown"; never guess.
