import { z } from "zod";
import { MIN_GRADES } from "./schema";

// data/generated/prereqs.json: prerequisite and corequisite text from courses.json,
// parsed deterministically by scripts/lib/prereqs/. Anything the parser can't map exactly
// is an `unknown` node holding the original text. The engine treats any unknown node as
// "cannot verify, check with an advisor" (see CLAUDE.md).

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
  | { type: "unknown"; text: string };

export const prereqNodeSchema: z.ZodType<PrereqNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("course"),
      code: z.string().regex(/^[A-Z]{2,5} \d{3}[A-Z]?$/),
      minGrade: z.enum(MIN_GRADES).nullable(),
      concurrentOk: z.boolean(),
    }),
    z.object({ type: z.literal("all"), of: z.array(prereqNodeSchema).min(2) }),
    z.object({ type: z.literal("any"), of: z.array(prereqNodeSchema).min(2) }),
    z.object({
      type: z.literal("units"),
      min: z.number().positive(),
      level: z.enum(["upper", "lower"]).optional(),
      subject: z
        .string()
        .regex(/^[A-Z]{2,5}$/)
        .optional(),
    }),
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
  code: z.string().regex(/^[A-Z]{2,5} \d{3}[A-Z]?$/),
  prereq: prereqNodeSchema.nullable(),
  coreq: prereqNodeSchema.nullable(),
  /**
   * parsed: every requirement mapped; partial: some unknown nodes; unparsed: only unknown
   * nodes; none: no requirement text (empty, or only recommendations).
   */
  status: z.enum(PREREQ_STATUSES),
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
