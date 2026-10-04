import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Policy } from "@/engine/audit/types";
import {
  coursesFileSchema,
  offeringsFileSchema,
  unknownCoursesFileSchema,
  type Course,
  type CourseOfferings,
  type UnknownCourse,
} from "./catalog";
import { prereqsFileSchema, type PrereqRecord } from "./prereqs";
import { requirementRecordSchema, type RequirementRow } from "./schema";

// Reads the JSON snapshot that `npm run data:build` writes to data/generated/, plus the
// policy file. Always available; the Snowflake source falls back to it.

// Paths start with a literal "data" folder so the bundler traces only data/, not the
// whole project.
const readJson = async (
  folder: "generated" | "policy",
  file: string,
): Promise<unknown> =>
  JSON.parse(
    await readFile(path.join(process.cwd(), "data", folder, file), "utf8"),
  );

export async function readCoursesJson(): Promise<Course[]> {
  return coursesFileSchema.parse(await readJson("generated", "courses.json"));
}

export async function readPrereqsJson(): Promise<PrereqRecord[]> {
  return prereqsFileSchema.parse(await readJson("generated", "prereqs.json"));
}

export async function readRequirementsJson(): Promise<RequirementRow[]> {
  const file = (await readJson("generated", "requirements.json")) as {
    requirements: unknown;
  };
  return requirementRecordSchema.array().parse(file.requirements);
}

export async function readCourseOfferingsJson(): Promise<
  Record<string, CourseOfferings>
> {
  return offeringsFileSchema.parse(
    await readJson("generated", "offerings.json"),
  );
}

/** Not stored in Snowflake: both sources read it from the JSON snapshot. */
export async function readUnknownCoursesJson(): Promise<UnknownCourse[]> {
  return unknownCoursesFileSchema.parse(
    await readJson("generated", "unknown-courses.json"),
  );
}

/** Not stored in Snowflake: both sources read it from data/policy/sfu.json. */
export async function readPolicyJson(): Promise<Policy> {
  return (await readJson("policy", "sfu.json")) as Policy;
}
