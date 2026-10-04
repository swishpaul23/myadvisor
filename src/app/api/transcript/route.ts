import { z } from "zod";
import {
  generateGeminiObjectFromFile,
  readGoogleGenerativeAiApiKey,
} from "@/lib/ai/google";
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM,
  isExtraction,
  MAX_PDF_BYTES,
  normalizeExtraction,
  type Extraction,
} from "@/lib/app/transcript";
import type { ApiError, ApiErrorCode, TranscriptResult } from "@/lib/app/types";
import { UnauthorizedError, requireUser } from "@/lib/auth/require-user";
import { loadReferenceData } from "@/lib/data/source";

// POST /api/transcript (multipart, field "file"): reads courses from an SFU transcript PDF
// with Gemini and returns them for the student to review. The file lives in memory for this
// request only: it is never written to disk, stored, or logged.

const fileSchema = z
  .instanceof(File, { message: "Choose a PDF file to upload." })
  .refine((f) => f.size > 0, "That file is empty.")
  .refine((f) => f.size <= MAX_PDF_BYTES, "too_large");

const UNREADABLE: Extraction = { courses: [], cgpa: null, standing: null };

function fail(status: number, error: ApiErrorCode, message: string) {
  return Response.json({ ok: false, error, message } satisfies ApiError, {
    status,
  });
}

/** PDFs start with "%PDF-". The browser's file type alone is easy to get wrong. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-"
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return fail(401, "unauthorized", "Sign in to upload a transcript.");
    throw err;
  }
  if (!readGoogleGenerativeAiApiKey())
    return fail(
      503,
      "upload_unavailable",
      "Upload unavailable, enter courses manually.",
    );

  const form = await request.formData().catch(() => null);
  const parsed = fileSchema.safeParse(form?.get("file"));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Choose a PDF file.";
    return message === "too_large"
      ? fail(
          413,
          "file_too_large",
          "That file is over 10 MB. Upload the PDF from SFU's student system.",
        )
      : fail(400, "invalid_input", message);
  }
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  if (!looksLikePdf(bytes))
    return fail(
      415,
      "not_a_pdf",
      "That file isn't a PDF. Upload your transcript as a PDF.",
    );

  const extraction = await generateGeminiObjectFromFile<Extraction>({
    file: { data: bytes, mediaType: "application/pdf" },
    schema: EXTRACTION_JSON_SCHEMA as never,
    name: "transcript",
    system: EXTRACTION_SYSTEM,
    prompt: "Transcribe every course on this transcript.",
    fallback: UNREADABLE,
    isValid: isExtraction,
  });
  if (extraction === UNREADABLE || extraction.courses.length === 0)
    return fail(
      422,
      "unreadable",
      "We couldn't read any courses from that file. Check it's your SFU transcript, or enter your courses manually.",
    );

  try {
    const { courses } = await loadReferenceData();
    const normalized = normalizeExtraction(
      extraction,
      new Set(courses.map((c) => c.code)),
    );
    return Response.json({
      ok: true,
      ...normalized,
    } satisfies TranscriptResult);
  } catch {
    console.error("Transcript normalisation failed.");
    return fail(
      500,
      "server_error",
      "Something went wrong reading your courses. Try again.",
    );
  }
}
