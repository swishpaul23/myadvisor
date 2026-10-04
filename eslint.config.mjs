import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The engine is pure: data in as arguments, results out as return values.
// It may not touch React, Next, the database, the LLM, or Node I/O.
// tests/engine/purity.test.ts proves this rule fires.
const ENGINE_PURITY_MESSAGE =
  "src/engine must stay pure: no UI, framework, database, LLM, or Node I/O imports. Pass data in as arguments instead.";

const engineForbiddenPaths = [
  "react",
  "react-dom",
  "next",
  "pg",
  "fs",
  "fs/promises",
  "path",
  "http",
  "node:fs",
  "node:fs/promises",
  "node:path",
  "node:http",
  "@/components",
  "@/app",
  "@/lib/llm",
  "@/lib/db",
].map((name) => ({ name, message: ENGINE_PURITY_MESSAGE }));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: engineForbiddenPaths,
          patterns: [
            {
              // Subpaths of the forbidden packages and aliases, e.g. next/server, @/lib/db/client.
              regex:
                "^(react|react-dom|next|pg|@/components|@/app|@/lib/llm|@/lib/db)/",
              message: ENGINE_PURITY_MESSAGE,
            },
            {
              // The same folders reached by relative path, e.g. ../lib/db.
              regex: "^\\.{1,2}/(.*/)?(components|app|lib/llm|lib/db)(/|$)",
              message: ENGINE_PURITY_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // The landing page (Vaibhav's) links into the app with plain <a> tags. Its owner keeps
    // them as <a>; a full page load on these few entry links is fine.
    files: ["src/components/landing/**"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python virtualenv, unrelated to the app.
    ".venv/**",
  ]),
]);

export default eslintConfig;
