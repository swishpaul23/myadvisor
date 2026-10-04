/**
 * audit-cli.ts. Run with `npm run audit -- <path to student JSON>`.
 *
 * Prints the degree audit for one student: one line per req_id (status, progress, notes)
 * and the summary counts. Template: tests/private/student.template.json (keys starting
 * with "_" are comments). Put real records in tests/private/ (gitignored).
 *
 * Privacy: the student's data goes to the terminal only. This script reads files and
 * never writes any, and prints nothing but the audit (no logging elsewhere).
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Course, UnknownCourse } from "@/lib/data/catalog";
import { CONCENTRATIONS, type RequirementRow } from "@/lib/data/schema";
import { audit } from "@/engine/audit";
import type { Policy, Student } from "@/engine/audit/types";

const term = z
  .string()
  .regex(/^\d{4}-(spring|summer|fall)$/, 'must be a term like "2025-fall"');
const studentSchema = z.object({
  program: z.string().min(1),
  admissionTerm: term,
  declaredConcentrations: z.array(z.enum(CONCENTRATIONS)),
  courses: z.array(
    z.object({
      code: z
        .string()
        .regex(
          /^[A-Z]{2,5} \d{3}[A-Z]?$/,
          'must be a course code like "BUS 217W"',
        ),
      grade: z
        .enum([
          "A+",
          "A",
          "A-",
          "B+",
          "B",
          "B-",
          "C+",
          "C",
          "C-",
          "D",
          "F",
          "FD",
          "N",
          "P",
          "W",
          "CR",
        ])
        .nullable(),
      units: z.number().nonnegative().optional(),
      term,
      institution: z.enum(["SFU", "transfer"]),
      status: z.enum(["completed", "in_progress", "planned"]),
    }),
  ),
});

/** Removes "_comment" keys at any depth. */
function stripComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => [k, stripComments(v)]),
    );
  }
  return value;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const path = process.argv[2];
if (!path)
  fail(
    "Usage: npm run audit -- <path to student JSON>  (see tests/private/student.template.json)",
  );

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  fail(`Could not read ${path}: ${(e as Error).message}`);
}
const parsed = studentSchema.safeParse(stripComments(raw));
if (!parsed.success) {
  fail(
    `Invalid student file ${path}:\n` +
      parsed.error.issues
        .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n"),
  );
}
const student = parsed.data as Student;

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const result = audit(student, {
  requirements: (
    json("data/generated/requirements.json") as {
      requirements: RequirementRow[];
    }
  ).requirements,
  courses: json("data/generated/courses.json") as Course[],
  unknownCourses: json(
    "data/generated/unknown-courses.json",
  ) as UnknownCourse[],
  policy: json("data/policy/sfu.json") as Policy,
});

const width = Math.max(...result.results.map((r) => r.reqId.length));
for (const r of result.results) {
  const p = r.progress;
  const progress = `${p.have ?? "?"}/${p.need} ${p.unit}`;
  const used = r.usedCourses.length > 0 ? ` [${r.usedCourses.join(", ")}]` : "";
  const notes = r.notes.length > 0 ? `  | ${r.notes.join(" | ")}` : "";
  console.log(
    `${r.reqId.padEnd(width)}  ${r.status.padEnd(14)} ${progress.padEnd(24)}${used}${notes}`,
  );
}

const s = result.summary;
console.log("");
console.log(
  `Summary: ${Object.entries(s.byStatus)
    .map(([status, n]) => `${status} ${n}`)
    .join(", ")}`,
);
console.log(`Units: ${s.earnedUnits} earned, ${s.inProgressUnits} in progress`);
console.log(
  `Unknown rows: ${result.unknowns.length}${result.unknowns.length ? ` (${result.unknowns.map((u) => u.reqId).join(", ")})` : ""}`,
);
