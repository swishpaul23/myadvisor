import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CoursesForm,
  NextTermForm,
  ProgramForm,
  QuestionForm,
  ReviewForm,
} from "@/components/app/onboarding-forms";
import { StepProgress } from "@/components/app/step-progress";
import { FOCUS, HINT, PANEL, SCREEN_TITLE } from "@/components/app/styles";
import { MOCK_SURVEY_QUESTIONS, SKIP } from "@/lib/app/mocks";
import {
  firstOpenStep,
  isStepSlug,
  nextQuestionIndex,
  stepIndex,
  STEPS,
} from "@/lib/app/onboarding";
import { readState } from "@/lib/app/store";
import {
  admissionYearOptions,
  coopTermOptions,
  planTermOptions,
  recordTermOptions,
  termLabel,
} from "@/lib/app/terms";
import type { OnboardingDraft } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Get started · MyAdvisor" };

const INTRO: Record<(typeof STEPS)[number]["slug"], string> = {
  program: "Your program and concentration decide which requirements apply.",
  "next-term":
    "Tell us where your plan starts, how full each term should be, and whether you're doing co-op.",
  courses: "Add every course you've completed or are taking now.",
  questions: "Three quick questions so the advisor knows what matters to you.",
  review: "Check everything once more. Your progress is worked out from this.",
};

export default async function StepPage({
  params,
  searchParams,
}: PageProps<"/app/start/[step]">) {
  const { step } = await params;
  if (!isStepSlug(step)) notFound();
  const { draft } = await readState();

  // Steps unlock in order: going back is fine, skipping ahead is not.
  const open = firstOpenStep(draft);
  if (stepIndex(step) > stepIndex(open)) redirect(`/app/start/${open}`);

  const today = new Date();
  const index = stepIndex(step);

  return (
    <div className={cn(PANEL, "flex flex-col gap-6 p-5 sm:p-7")}>
      <StepProgress steps={STEPS} current={index} />
      <div>
        <h1 className={SCREEN_TITLE}>{STEPS[index]!.title}</h1>
        <p className="mt-1 text-[14px] leading-[1.5] text-ink-body">
          {INTRO[step]}
        </p>
      </div>
      {step === "program" && (
        <ProgramForm
          admissionTerm={draft?.admissionTerm}
          concentrations={draft?.concentrations}
          yearOptions={admissionYearOptions(today)}
        />
      )}
      {step === "next-term" && (
        <NextTermForm
          planTerm={draft?.planTerm}
          courseLoad={draft?.courseLoad}
          coop={draft?.coop}
          termOptions={planTermOptions(today)}
          coopOptions={coopTermOptions(today)}
        />
      )}
      {step === "courses" && (
        <CoursesForm
          courses={draft?.courses ?? []}
          termOptions={recordTermOptions(today)}
        />
      )}
      {step === "questions" && (
        <Question draft={draft} q={(await searchParams).q} />
      )}
      {step === "review" && draft && <Review draft={draft} />}
    </div>
  );
}

function Question({
  draft,
  q,
}: {
  draft: OnboardingDraft | null;
  q: string | string[] | undefined;
}) {
  const requested = Number(Array.isArray(q) ? q[0] : q);
  const total = MOCK_SURVEY_QUESTIONS.length;
  const index = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 0), total - 1)
    : Math.min(nextQuestionIndex(draft), total - 1);
  const question = MOCK_SURVEY_QUESTIONS[index]!;
  return (
    <QuestionForm
      key={question.id}
      question={question}
      index={index}
      total={total}
      answer={draft?.surveyAnswers?.[question.id]}
    />
  );
}

function Review({ draft }: { draft: OnboardingDraft }) {
  const courses = draft.courses ?? [];
  const count = (pred: (c: (typeof courses)[number]) => boolean) =>
    courses.filter(pred).length;
  const answers = MOCK_SURVEY_QUESTIONS.map((q) => {
    const a = draft.surveyAnswers?.[q.id];
    return {
      q: q.text,
      a:
        a === SKIP
          ? "Skipped"
          : (q.options.find((o) => o.id === a)?.label ?? "—"),
    };
  });
  const rows: [string, string, string][] = [
    ["Program", "BBA", "program"],
    [
      "Admitted",
      draft.admissionTerm ? termLabel(draft.admissionTerm) : "—",
      "program",
    ],
    ["Concentration", draft.concentrations?.join(" and ") ?? "—", "program"],
    [
      "Planning",
      draft.planTerm
        ? `From ${termLabel(draft.planTerm)} · ${draft.courseLoad} courses per term`
        : "—",
      "next-term",
    ],
    [
      "Co-op",
      !draft.coop?.doing
        ? "No"
        : draft.coop.workTerms.length > 0
          ? `Yes · ${draft.coop.workTerms.map(termLabel).join(", ")}`
          : "Yes · default placement",
      "next-term",
    ],
    [
      "Courses",
      `${count((c) => c.status === "completed")} completed · ${count((c) => c.status === "in_progress")} in progress · ${count((c) => c.institution === "transfer")} transfer`,
      "courses",
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col rounded-[12px] border border-line-soft">
        {rows.map(([label, value, slug]) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line-soft px-4 py-3 last:border-b-0"
          >
            <dt className="w-32 flex-none text-ink-muted">{label}</dt>
            <dd className="min-w-0 flex-1">{value}</dd>
            <Link
              href={`/app/start/${slug}`}
              className={cn(
                "text-[12px] text-ink-body underline underline-offset-2",
                FOCUS,
              )}
            >
              Edit<span className="sr-only"> {label.toLowerCase()}</span>
            </Link>
          </div>
        ))}
      </dl>
      <details className="rounded-[12px] border border-line-soft px-4 py-3">
        <summary
          className={cn("cursor-pointer text-[13px] font-medium", FOCUS)}
        >
          Your courses ({courses.length})
        </summary>
        <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
          {courses.map((c, i) => (
            <li
              key={`${c.code}-${c.term}-${i}`}
              className="flex justify-between gap-3 border-b border-line-soft py-2 text-[13px] last:border-b-0"
            >
              <span className="font-medium">{c.code}</span>
              <span className="text-ink-muted">
                {termLabel(c.term)} ·{" "}
                {c.status === "in_progress" ? "In progress" : c.grade}
                {c.institution === "transfer" ? " · Transfer" : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <div>
        <p className="text-[13px] font-medium">Your answers</p>
        <ul className={cn(HINT, "mt-1.5 flex flex-col gap-1")}>
          {answers.map(({ q, a }) => (
            <li key={q}>
              {q} <span className="text-ink">{a}</span>
            </li>
          ))}
        </ul>
      </div>
      <ReviewForm />
    </div>
  );
}
