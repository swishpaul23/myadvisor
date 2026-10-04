import { z } from "zod";
import { CONCENTRATIONS } from "@/lib/data/schema";

// The one contract between the app UI and the server (store, server actions, API routes).
// Schemas validate every input; the types are inferred from them.

export { CONCENTRATIONS };
export type Concentration = (typeof CONCENTRATIONS)[number];

export const SEASONS = ["spring", "summer", "fall"] as const;
export const termSchema = z
  .string()
  .regex(/^\d{4}-(spring|summer|fall)$/, "Pick a term.");

export const courseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((s) => s.replace(/^([A-Z]{2,5})\s*(\d{3}[A-Z]?)$/, "$1 $2"))
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{2,5} \d{3}[A-Z]?$/, 'Use a course code like "BUS 217W".'),
  );

export const GRADES = [
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "FD", "N", "P", "W", "CR",
] as const; // prettier-ignore

export const RECORD_STATUSES = ["completed", "in_progress"] as const;
export const INSTITUTIONS = ["SFU", "transfer"] as const;

/** Most courses a record may hold: keeps the encrypted cookie within its size budget. */
export const MAX_COURSES = 60;

export const recordCourseSchema = z
  .object({
    code: courseCodeSchema,
    term: termSchema,
    status: z.enum(RECORD_STATUSES),
    /** Letter grade for completed courses; null while in progress. */
    grade: z.enum(GRADES).nullable(),
    institution: z.enum(INSTITUTIONS),
    /** Only needed when the course isn't in the SFU course data (e.g. some transfer codes). */
    units: z.number().min(0).max(30).nullable(),
  })
  .refine((c) => c.status === "in_progress" || c.grade !== null, {
    path: ["grade"],
    message: "Add the grade for a completed course.",
  })
  .refine((c) => c.status === "completed" || c.grade === null, {
    path: ["grade"],
    message: "A course in progress has no grade yet.",
  });
export type RecordCourse = z.infer<typeof recordCourseSchema>;

export const coursesSchema = z
  .array(recordCourseSchema)
  .max(MAX_COURSES, `A record can hold up to ${MAX_COURSES} courses.`);

/** Courses per term the student wants to plan for. */
export const COURSE_LOADS = [2, 3, 4, 5, 6] as const;

export const ORIGINS = ["sample", "transcript", "manual"] as const;
export type Origin = (typeof ORIGINS)[number];

export const profileSchema = z.object({
  /** Only the BBA is supported. */
  program: z.literal("BBA"),
  admissionTerm: termSchema,
  concentrations: z
    .array(z.enum(CONCENTRATIONS))
    .min(1, "Pick at least one concentration.")
    .max(2, "Pick at most two concentrations."),
  planTerm: termSchema,
  courseLoad: z
    .number()
    .int()
    .min(COURSE_LOADS[0], "Pick a course load.")
    .max(COURSE_LOADS[COURSE_LOADS.length - 1]!, "Pick a course load."),
  courses: coursesSchema,
  origin: z.enum(ORIGINS),
  /** The student reviewed the course list and confirmed it. */
  recordConfirmed: z.boolean(),
  /** Survey question id -> chosen option id, or "skip". */
  surveyAnswers: z.record(z.string(), z.string()),
});
export type StudentProfile = z.infer<typeof profileSchema>;

/** Onboarding in progress: any subset of the profile, plus the step to resume at. */
export const draftSchema = profileSchema.partial().extend({
  step: z.number().int().min(0).max(10),
});
export type OnboardingDraft = z.infer<typeof draftSchema>;

/** Everything the app keeps for one signed-in student (see store.ts). */
export const appStateSchema = z.object({
  version: z.literal(1),
  profile: profileSchema.nullable(),
  draft: draftSchema.nullable(),
});
export type AppState = z.infer<typeof appStateSchema>;
export const EMPTY_STATE: AppState = { version: 1, profile: null, draft: null };

// ---------- Presented results (server -> UI) ----------

export type ClaimStatus = "verified" | "assumption" | "unresolved";

export type Source = { title: string; url: string };

/** One statement shown to the student, labelled by how far the engine could check it. */
export type Claim = { text: string; status: ClaimStatus; source?: Source };

/** An unmet requirement the engine found. */
export type Gap = {
  reqId: string;
  label: string;
  /** Specific courses still needed, when the requirement names them. */
  courses: string[];
  detail: string;
  source: Source;
};

export type PlanCourse = {
  /** A course code, or null for an open elective slot ("Your choice"). */
  code: string | null;
  label: string;
  note: string;
  units: number | null;
  closesGap: boolean;
};

export type Plan = {
  termId: string;
  courses: PlanCourse[];
  units: number | null;
  claims: Claim[];
};

/** Machine-readable error codes every app API route may return, with a plain message. */
export type ApiErrorCode =
  | "unauthorized"
  | "invalid_input"
  | "file_too_large"
  | "not_a_pdf"
  | "upload_unavailable"
  | "unreadable"
  | "server_error";
export type ApiError = { ok: false; error: ApiErrorCode; message: string };

/** POST /api/transcript: courses read from the PDF, for the student to review. */
export type TranscriptResult =
  | {
      ok: true;
      courses: RecordCourse[];
      /** Row index -> what to double-check. */
      flags: Record<number, string>;
      cgpa: number | null;
      standing: string | null;
    }
  | ApiError;

/** A server action result: ok, or a plain-language error with per-field messages. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
