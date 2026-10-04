import { z } from "zod";
import { MIN_GRADES } from "./schema";

// data/generated/prereqs.json: prerequisite and corequisite text from courses.json,
// parsed deterministically by scripts/lib/prereqs/, with manual overrides from
// data/sheets/prereq-overrides.csv. How the engine treats each node kind is in CLAUDE.md:
// unknown and restriction nodes mean "cannot verify, check with an advisor".

export type PrereqNode =
  | {
      type: "course";
      code: string;
      /** Minimum grade the text states for this course; null if none. */
      minGrade: (typeof MIN_GRADES)[number] | null;
      /** True when the text allows taking it before or at the same time. */
      concurrentOk: boolean;
    }
  | { type: "all"; of: PrereqNode[] }
  | { type: "any"; of: PrereqNode[] }
  | {
      type: "units";
      min: number;
      level?: "upper" | "lower";
      subject?: string;
    }
  /** "two 200-division English courses": n courses, optionally of a subject and level. */
  | { type: "count"; n: number; subject?: string; level?: number; text: string }
  /** "permission of the instructor": not verifiable; may be waived by permission. */
  | {
      type: "permission";
      who: "instructor" | "department" | "co-op coordinator";
      text: string;
    }
  /** Program or admission restriction ("Reserved for English honours ... students"). */
  | { type: "restriction"; text: string }
  /** Anything the parser can't map exactly, kept verbatim. */
  | { type: "unknown"; text: string };

const courseCode = z.string().regex(/^[A-Z]{2,5} \d{3}[A-Z]?$/);
const subject = z.string().regex(/^[A-Z]{2,5}$/);

export const prereqNodeSchema: z.ZodType<PrereqNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("course"),
      code: courseCode,
      minGrade: z.enum(MIN_GRADES).nullable(),
      concurrentOk: z.boolean(),
    }),
    z.object({ type: z.literal("all"), of: z.array(prereqNodeSchema).min(2) }),
    z.object({ type: z.literal("any"), of: z.array(prereqNodeSchema).min(2) }),
    z.object({
      type: z.literal("units"),
      min: z.number().positive(),
      level: z.enum(["upper", "lower"]).optional(),
      subject: subject.optional(),
    }),
    z.object({
      type: z.literal("count"),
      n: z.number().int().positive(),
      subject: subject.optional(),
      level: z.number().int().min(100).max(900).multipleOf(100).optional(),
      text: z.string().min(1),
    }),
    z.object({
      type: z.literal("permission"),
      who: z.enum(["instructor", "department", "co-op coordinator"]),
      text: z.string().min(1),
    }),
    z.object({ type: z.literal("restriction"), text: z.string().min(1) }),
    z.object({ type: z.literal("unknown"), text: z.string().min(1) }),
  ]),
);

export const PREREQ_STATUSES = [
  "parsed",
  "partial",
  "unparsed",
  "none",
] as const;

export const prereqRecordSchema = z.object({
  code: courseCode,
  prereq: prereqNodeSchema.nullable(),
  coreq: prereqNodeSchema.nullable(),
  /**
   * parsed: no unknown nodes; partial: some unknown nodes; unparsed: only unknown nodes;
   * none: no requirement (empty text, or only recommendations).
   */
  status: z.enum(PREREQ_STATUSES),
  /** "override" when data/sheets/prereq-overrides.csv replaced the parsed `prereq`. */
  source: z.enum(["parsed", "override"]),
  /** prerequisites_text exactly as in courses.json ("" when empty). */
  raw: z.string(),
  /** corequisites_text exactly as in courses.json; null when empty. */
  raw_coreq: z.string().nullable(),
  /** Recommendation sentences, recognized and kept out of the requirement tree. */
  advisory: z.array(z.string()),
  /** The text of every unknown node, in order. */
  unparsed_fragments: z.array(z.string()),
});
export const prereqsFileSchema = z.array(prereqRecordSchema);
export type PrereqRecord = z.output<typeof prereqRecordSchema>;

/** One row of data/sheets/prereq-overrides.csv; override_json is a PrereqNode or null. */
export const PREREQ_OVERRIDE_COLUMNS = [
  "course_code",
  "override_text",
  "reason",
  "source_url",
  "override_json",
] as const;

export const prereqOverrideRowSchema = z.object({
  course_code: courseCode,
  /** The prerequisite as written by the person entering the override. */
  override_text: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  source_url: z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+$/, "must be an http(s) URL"),
  /** `null` means the course has no prerequisite. */
  override_json: prereqNodeSchema.nullable(),
});
export type PrereqOverride = z.output<typeof prereqOverrideRowSchema>;
