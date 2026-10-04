import { ESLint } from "eslint";
import { beforeAll, describe, expect, test } from "vitest";

// Proves the no-restricted-imports rule in eslint.config.mjs keeps src/engine pure.
// The probe file does not exist; ESLint only uses its path to pick the config.
const eslint = new ESLint();

async function engineImportErrors(source: string): Promise<number> {
  const [result] = await eslint.lintText(source, {
    filePath: "src/engine/__probe__.ts",
  });
  return (result?.messages ?? []).filter(
    (m) => m.ruleId === "no-restricted-imports",
  ).length;
}

describe("engine purity lint rule", () => {
  // Loading the Next/TypeScript ESLint config is slow the first time; do it once here.
  beforeAll(async () => {
    await engineImportErrors("");
  }, 120_000);

  test.each([
    'import React from "react";',
    'import { NextResponse } from "next/server";',
    'import { Pool } from "pg";',
    'import { readFileSync } from "fs";',
    'import { readFile } from "node:fs/promises";',
    'import path from "path";',
    'import http from "node:http";',
    'import { Button } from "@/components/ui/button";',
    'import page from "@/app/page";',
    'import { client } from "@/lib/llm/client";',
    'import { db } from "@/lib/db";',
    'import { db } from "../lib/db/client";',
  ])("rejects %s", async (source) => {
    expect(await engineImportErrors(source)).toBe(1);
  });

  test("allows pure imports", async () => {
    expect(
      await engineImportErrors(
        'import { z } from "zod";\nimport { x } from "./audit";',
      ),
    ).toBe(0);
  });
});
