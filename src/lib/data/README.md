# src/lib/data

Loads reference data (Postgres, falling back to `data/generated/` JSON) into typed objects validated with zod.
Hands plain data to the engine; does no rule computation itself.
