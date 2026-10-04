import "server-only";
import type { Catalog } from "@/engine/audit/types";
import type { CourseOfferings } from "./catalog";
import {
  buildCalendarChunks,
  searchChunks,
  type CalendarChunk,
  type CalendarHit,
} from "./calendar-search";
import {
  readCourseOfferingsJson,
  readCoursesJson,
  readPolicyJson,
  readPrereqsJson,
  readRequirementsJson,
  readUnknownCoursesJson,
} from "./json";
import type { PrereqRecord } from "./prereqs";
import {
  readCourseOfferings,
  readCourses,
  readPrereqs,
  readRequirements,
  searchCalendarSnowflake,
} from "./snowflake";

// Where the app's reference data comes from. DATA_SOURCE=json (default) reads the
// data/generated/ snapshot. DATA_SOURCE=snowflake reads myadvisor.app, and falls back to
// the snapshot if Snowflake errors or takes longer than SNOWFLAKE_TIMEOUT_MS, so the demo
// keeps working. Loaded once per server process.

export type DataSource = "json" | "snowflake";

export type ReferenceData = Catalog & {
  prereqs: PrereqRecord[];
  offerings: Record<string, CourseOfferings>;
  /** Where the data actually came from. */
  source: DataSource;
  /** Why DATA_SOURCE=snowflake fell back to json; null otherwise. */
  fallbackReason: string | null;
};

export function configuredDataSource(): DataSource {
  return process.env.DATA_SOURCE === "snowflake" ? "snowflake" : "json";
}

function timeoutMs(): number {
  const ms = Number(process.env.SNOWFLAKE_TIMEOUT_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : 15000;
}

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  const ms = timeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const reason = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

async function loadJson(fallbackReason: string | null): Promise<ReferenceData> {
  const [courses, prereqs, requirements, offerings, unknownCourses, policy] =
    await Promise.all([
      readCoursesJson(),
      readPrereqsJson(),
      readRequirementsJson(),
      readCourseOfferingsJson(),
      readUnknownCoursesJson(),
      readPolicyJson(),
    ]);
  return {
    courses,
    prereqs,
    requirements,
    offerings,
    unknownCourses,
    policy,
    source: "json",
    fallbackReason,
  };
}

async function loadSnowflake(): Promise<ReferenceData> {
  const [courses, prereqs, requirements, offerings, unknownCourses, policy] =
    await Promise.all([
      readCourses(),
      readPrereqs(),
      readRequirements(),
      readCourseOfferings(),
      readUnknownCoursesJson(),
      readPolicyJson(),
    ]);
  return {
    courses,
    prereqs,
    requirements,
    offerings,
    unknownCourses,
    policy,
    source: "snowflake",
    fallbackReason: null,
  };
}

let loaded: Promise<ReferenceData> | null = null;

/** The reference data for the engine, read once per server process. */
export function loadReferenceData(): Promise<ReferenceData> {
  loaded ??= (async () => {
    if (configuredDataSource() === "json") return loadJson(null);
    try {
      return await withTimeout(loadSnowflake(), "Snowflake load");
    } catch (err) {
      console.warn(
        `[data] Snowflake unavailable, using JSON snapshot: ${reason(err)}`,
      );
      return loadJson(reason(err));
    }
  })();
  return loaded;
}

let chunks: CalendarChunk[] | null = null;

async function searchCalendarJson(question: string): Promise<CalendarHit[]> {
  if (!chunks) {
    const [courses, requirements] = await Promise.all([
      readCoursesJson(),
      readRequirementsJson(),
    ]);
    chunks = buildCalendarChunks(courses, requirements);
  }
  return searchChunks(chunks, question);
}

/**
 * Calendar passages for a question, each with its source_url for citation. Uses
 * calendar_chunks in Snowflake when DATA_SOURCE=snowflake, else the same chunks built
 * from the JSON snapshot. Never logs the question.
 */
export async function searchCalendar(question: string): Promise<CalendarHit[]> {
  if (configuredDataSource() === "snowflake") {
    try {
      return await withTimeout(
        searchCalendarSnowflake(question),
        "Snowflake search",
      );
    } catch (err) {
      console.warn(
        `[data] Snowflake search failed, using JSON snapshot: ${reason(err)}`,
      );
    }
  }
  return searchCalendarJson(question);
}
