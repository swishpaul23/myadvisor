import {
  courseCodeSchema,
  GRADES,
  termSchema,
  type RecordCourse,
} from "./types";

// Transcript extraction: the JSON shape Gemini must return, a hand-written guard for it
// (src/lib/ai/google.ts convention: no zod in Gemini schemas), and normalisation into
// RecordCourse rows with a flag on every row the student should double-check. Gemini only
// transcribes the file; it never decides a requirement.

/** Largest transcript PDF accepted (SFU transcripts are well under 1 MB). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export type ExtractedCourse = {
  code: string;
  title: string | null;
  units: number | null;
  grade: string | null;
  term: string | null;
  status: "completed" | "in_progress";
  institution: "SFU" | "transfer";
};

export type Extraction = {
  courses: ExtractedCourse[];
  cgpa: number | null;
  standing: string | null;
};

const nullable = (type: "string" | "number") => ({
  anyOf: [{ type }, { type: "null" }],
});

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["courses", "cgpa", "standing"],
  properties: {
    courses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "title",
          "units",
          "grade",
          "term",
          "status",
          "institution",
        ],
        properties: {
          code: {
            type: "string",
            description: 'Course code, e.g. "BUS 217W".',
          },
          title: nullable("string"),
          units: nullable("number"),
          grade: {
            ...nullable("string"),
            description: "Letter grade exactly as printed; null if none yet.",
          },
          term: {
            ...nullable("string"),
            description: 'Term as "YYYY-spring", "YYYY-summer" or "YYYY-fall".',
          },
          status: { type: "string", enum: ["completed", "in_progress"] },
          institution: { type: "string", enum: ["SFU", "transfer"] },
        },
      },
    },
    cgpa: nullable("number"),
    standing: nullable("string"),
  },
} as const;

export const EXTRACTION_SYSTEM = `You transcribe Simon Fraser University (SFU) unofficial transcripts into JSON.
Copy only what is printed. Never guess, infer, or add courses that are not in the document.
- One entry per course attempt, in the order printed. Keep repeated attempts as separate entries.
- code: department and number as printed, e.g. "BUS 217W", "MATH 157".
- term: convert the printed term to "YYYY-spring" (January-April), "YYYY-summer" (May-August) or "YYYY-fall" (September-December). Use null if no term is printed.
- grade: the letter grade exactly as printed (A+ to F, FD, N, P, W, CR). Use null when there is no final grade yet.
- status: "in_progress" for courses with no final grade in the current term, otherwise "completed".
- institution: "transfer" for transfer credit, otherwise "SFU". For transfer credit with no letter grade, use grade "CR".
- units: the credit units as printed, or null.
- cgpa and standing: only if printed on the transcript, else null.
If the document is not an SFU transcript, return an empty courses list.`;

const isNullableString = (v: unknown) => v === null || typeof v === "string";
const isNullableNumber = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v));

/** Hand-written guard for Gemini's output. */
export function isExtraction(value: unknown): value is Extraction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.courses) || v.courses.length > 200) return false;
  if (!isNullableNumber(v.cgpa) || !isNullableString(v.standing)) return false;
  return v.courses.every((c: unknown) => {
    if (!c || typeof c !== "object") return false;
    const r = c as Record<string, unknown>;
    return (
      typeof r.code === "string" &&
      isNullableString(r.title) &&
      isNullableNumber(r.units) &&
      isNullableString(r.grade) &&
      isNullableString(r.term) &&
      (r.status === "completed" || r.status === "in_progress") &&
      (r.institution === "SFU" || r.institution === "transfer")
    );
  });
}

export type NormalizedTranscript = {
  courses: RecordCourse[];
  /** Row index -> what to double-check. */
  flags: Record<number, string>;
  cgpa: number | null;
  standing: string | null;
};

const GRADE_SET = new Set<string>(GRADES);
/** Transfer-credit marks printed instead of a letter grade. */
const TRANSFER_MARKS = new Set(["TR", "T", "TC"]);

/**
 * Gemini rows -> editable RecordCourse rows. A row that can't be used as-is keeps what was
 * read and gets a flag; the student fixes it in the review table before confirming.
 * `knownCodes` is the course data MyAdvisor has (not every SFU course).
 */
export function normalizeExtraction(
  raw: Extraction,
  knownCodes: ReadonlySet<string>,
): NormalizedTranscript {
  const flags: Record<number, string> = {};
  const courses = raw.courses.map((c, i): RecordCourse => {
    const problems: string[] = [];
    const parsedCode = courseCodeSchema.safeParse(c.code);
    const code = parsedCode.success ? parsedCode.data : c.code.trim();
    if (!parsedCode.success) problems.push("check the course code");
    else if (c.institution === "SFU" && !knownCodes.has(code))
      problems.push(
        "not in MyAdvisor's course data, so it may not count toward requirements; check the code",
      );

    const term = c.term && termSchema.safeParse(c.term).success ? c.term : "";
    if (!term) problems.push("pick the term");

    let grade: RecordCourse["grade"] = null;
    if (c.status === "completed") {
      const printed = c.grade?.trim().toUpperCase() ?? "";
      if (GRADE_SET.has(printed)) grade = printed as RecordCourse["grade"];
      else if (
        c.institution === "transfer" &&
        (!printed || TRANSFER_MARKS.has(printed))
      )
        grade = "CR";
      else
        problems.push(
          printed
            ? `grade "${printed}" isn't one we recognise`
            : "add the grade",
        );
    }

    if (problems.length > 0) {
      const text = problems.join("; ");
      flags[i] =
        `Check this row: ${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
    }
    return {
      code,
      term,
      status: c.status,
      grade,
      institution: c.institution,
      units: c.units !== null && c.units >= 0 && c.units <= 30 ? c.units : null,
    };
  });
  return { courses, flags, cgpa: raw.cgpa, standing: raw.standing };
}
