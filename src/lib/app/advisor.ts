import { z } from "zod";
import type { CalendarHit } from "@/lib/data/calendar-search";
import { MOCK_SURVEY_QUESTIONS, SKIP } from "./mocks";
import {
  source,
  uniqueSources,
  type ChecklistItem,
  type UnitsSummary,
} from "./present";
import { termLabel } from "./terms";
import type { Gap, Plan, Source, StudentProfile } from "./types";

// The advisor chat, as plain functions: request validation, the grounded prompt, and which
// numbered sources an answer cites. Gemini only explains: every fact in the prompt comes
// from the rules engine or the SFU calendar, and the instructions forbid deciding anything
// the facts don't say.

export const MAX_MESSAGE = 1000;
export const MAX_HISTORY = 10;

export const advisorRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Type a question.")
    .max(MAX_MESSAGE, `Keep questions under ${MAX_MESSAGE} characters.`),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "advisor"]),
        text: z.string().max(4000),
      }),
    )
    .max(MAX_HISTORY)
    .default([]),
});
export type AdvisorRequest = z.infer<typeof advisorRequestSchema>;

export const ADVISOR_SYSTEM = `You are MyAdvisor, an academic planning assistant for one SFU BBA student.
Rules you must follow:
- Use ONLY the facts and calendar passages given below. They come from MyAdvisor's rules engine and the SFU calendar.
- Never decide on your own whether a requirement is met, whether a prerequisite is satisfied, or what a grade rule is. If the facts don't answer the question, say you can't confirm it and suggest checking with an academic advisor.
- Keep each statement's label: facts marked ASSUMPTION or UNRESOLVED must be described as assumptions or as not yet checked.
- Cite sources by their number in square brackets, e.g. [2], right after the statement they support. Only use the numbers listed under SOURCES.
- A plan is not enrolment: never imply seats, timetable fit or registration.
- Plain language, short paragraphs, no more than about 150 words. No markdown headings or tables.`;

export type AdvisorFacts = {
  profile: StudentProfile;
  units: UnitsSummary;
  checklist: ChecklistItem[];
  gaps: Gap[];
  plan: Plan;
};

const STATUS_WORD = {
  complete: "complete",
  in_progress: "in progress",
  gap: "GAP",
  unresolved: "UNRESOLVED (can't be checked automatically)",
} as const;

function surveyLines(profile: StudentProfile): string[] {
  return MOCK_SURVEY_QUESTIONS.flatMap((q) => {
    const a = profile.surveyAnswers[q.id];
    if (!a || a === SKIP) return [];
    const label = q.options.find((o) => o.id === a)?.label;
    return label ? [`- ${q.text} ${label}`] : [];
  });
}

/** The grounded prompt and the numbered sources it lists. */
export function buildAdvisorPrompt(
  facts: AdvisorFacts,
  passages: CalendarHit[],
  request: AdvisorRequest,
): { prompt: string; sources: Source[] } {
  const { profile, units, checklist, gaps, plan } = facts;
  const sources = uniqueSources([
    ...gaps.map((g) => g.source),
    ...plan.claims.map((c) => c.source),
    ...passages.map((p) => source(p.source_url)),
  ]);
  const n = (url: string) => sources.findIndex((s) => s.url === url) + 1;
  const cite = (s?: Source) => (s ? ` [${n(s.url)}]` : "");

  const completed = profile.courses.filter((c) => c.status === "completed");
  const inProgress = profile.courses.filter((c) => c.status === "in_progress");
  const lines = [
    "STUDENT",
    `- BBA, ${profile.concentrations.join(" and ")} concentration; admitted ${termLabel(profile.admissionTerm)}${profile.origin === "sample" ? " (a fictional sample student)" : ""}.`,
    `- Completed courses: ${completed.map((c) => `${c.code} ${c.grade}`).join(", ") || "none"}.`,
    `- In progress: ${inProgress.map((c) => c.code).join(", ") || "none"}.`,
    `- Units: ${units.completed} completed, ${units.inProgress} in progress (not yet counted), ${units.required ?? 120} required.`,
    "",
    "REQUIREMENT STATUS (from the rules engine)",
    ...checklist.map(
      (i) =>
        `- ${i.label}: ${STATUS_WORD[i.status]}${i.detail ? ` (${i.detail})` : ""}`,
    ),
    "",
    "REQUIRED COURSES NOT ON THE RECORD (gaps)",
    ...(gaps.length
      ? gaps.map((g) => `- ${g.label}: ${g.detail}${cite(g.source)}`)
      : ["- none"]),
    "",
    `PLAN BY TERM, from ${termLabel(plan.termId)} (a plan, not enrolment)`,
    ...plan.terms.map((t) =>
      t.kind === "coop"
        ? `- ${termLabel(t.termId)}: co-op work term, no courses`
        : `- ${termLabel(t.termId)}: ${t.courses.map((c) => (c.code ? `${c.code} (${c.note})` : c.label)).join("; ")}`,
    ),
    ...plan.notes.map((n) => `- Note: ${n}`),
    "Why this plan:",
    ...plan.claims.map(
      (c) => `- ${c.status.toUpperCase()}: ${c.text}${cite(c.source)}`,
    ),
  ];
  const prefs = surveyLines(profile);
  if (prefs.length)
    lines.push("", "STUDENT PREFERENCES (from the intake questions)", ...prefs);
  if (passages.length) {
    lines.push(
      "",
      "CALENDAR PASSAGES (search results for the question)",
      ...passages.map(
        (p) => `- ${p.text.slice(0, 600)}${cite(source(p.source_url))}`,
      ),
    );
  }
  lines.push(
    "",
    "SOURCES",
    ...sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})`),
  );
  if (request.history.length) {
    lines.push(
      "",
      "CONVERSATION SO FAR",
      ...request.history.map(
        (m) => `${m.role === "user" ? "Student" : "MyAdvisor"}: ${m.text}`,
      ),
    );
  }
  lines.push("", `STUDENT'S QUESTION: ${request.message}`);
  return { prompt: lines.join("\n"), sources };
}

/** The sources an answer cites by number, in order of first mention; unknown numbers dropped. */
export function citedSources(answer: string, sources: Source[]): Source[] {
  const cited: Source[] = [];
  for (const [, num] of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const s = sources[Number(num) - 1];
    if (s && !cited.includes(s)) cited.push(s);
  }
  return cited;
}

/** Removes citation numbers that don't match a listed source. */
export function stripUnknownCitations(answer: string, count: number): string {
  return answer
    .replace(/\s?\[(\d{1,2})\]/g, (m, num: string) =>
      Number(num) >= 1 && Number(num) <= count ? m : "",
    )
    .trim();
}

/** The chat's first message: plays back the intake answers (no AI involved). */
export function introMessage(profile: StudentProfile, plan: Plan): string {
  const prefs = MOCK_SURVEY_QUESTIONS.flatMap((q) => {
    const a = profile.surveyAnswers[q.id];
    const label = q.options.find((o) => o.id === a)?.label;
    return label
      ? [`${q.text.replace(/\?$/, "")}: ${label.toLowerCase()}`]
      : [];
  });
  const head = prefs.length
    ? `From your answers: ${prefs.join("; ")}.`
    : "Hi! I can explain your degree progress and your plan.";
  return `${head} Want to start with your ${termLabel(plan.termId)} plan, or ask about any requirement?`;
}
