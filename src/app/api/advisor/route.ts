import {
  generateGeminiText,
  readGoogleGenerativeAiApiKey,
} from "@/lib/ai/google";
import {
  ADVISOR_SYSTEM,
  advisorRequestSchema,
  buildAdvisorPrompt,
  citedSources,
  stripUnknownCitations,
} from "@/lib/app/advisor";
import { getDegreeView } from "@/lib/app/degree";
import type { AdvisorReply, ApiError, ApiErrorCode } from "@/lib/app/types";
import { UnauthorizedError, requireUser } from "@/lib/auth/require-user";
import { searchCalendar } from "@/lib/data/source";

// POST /api/advisor { message, history }: answers a question about the signed-in student's
// degree, grounded in the rules engine's results and SFU calendar passages. Gemini only
// explains. Messages are never stored or logged (they can contain grades).

const UNAVAILABLE = "\u0000advisor-unavailable";

function fail(status: number, error: ApiErrorCode, message: string) {
  return Response.json({ ok: false, error, message } satisfies ApiError, {
    status,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError)
      return fail(401, "unauthorized", "Sign in to use the advisor.");
    throw err;
  }
  if (!readGoogleGenerativeAiApiKey())
    return fail(
      503,
      "advisor_unavailable",
      "The advisor isn't available right now. Your progress and plan still work.",
    );

  const body: unknown = await request.json().catch(() => null);
  const parsed = advisorRequestSchema.safeParse(body);
  if (!parsed.success)
    return fail(
      400,
      "invalid_input",
      parsed.error.issues[0]?.message ?? "That message couldn't be read.",
    );

  const view = await getDegreeView();
  if (!view)
    return fail(
      400,
      "invalid_input",
      "Set up your profile before asking the advisor.",
    );

  const passages = await searchCalendar(parsed.data.message).catch(() => []);
  const { prompt, sources } = buildAdvisorPrompt(view, passages, parsed.data);
  const answer = await generateGeminiText({
    system: ADVISOR_SYSTEM,
    prompt,
    temperature: 0.2,
    timeoutMs: 30_000,
    fallback: UNAVAILABLE,
  });
  if (answer === UNAVAILABLE)
    return fail(
      503,
      "advisor_unavailable",
      "The advisor couldn't answer just now. Try again in a moment.",
    );

  const clean = stripUnknownCitations(answer, sources.length);
  return Response.json({
    ok: true,
    answer: clean,
    sources: citedSources(clean, sources),
  } satisfies AdvisorReply);
}
