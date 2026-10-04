"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  finishOnboarding,
  loadSampleStudent,
  saveAnswer,
  saveStep,
} from "@/app/app/start/actions";
import { SKIP, type SurveyQuestion } from "@/lib/app/mocks";
import { seasonLabel, termLabel } from "@/lib/app/terms";
import {
  CONCENTRATIONS,
  COURSE_LOADS,
  SEASONS,
  type ActionResult,
  type Coop,
  type RecordCourse,
} from "@/lib/app/types";
import { cn } from "@/lib/utils";
import { CourseEditor } from "./course-editor";
import { FieldError, FormError, SubmitButton } from "./form-parts";
import { BUTTON_BRAND, BUTTON_SECONDARY, FIELD, HINT, LABEL } from "./styles";

type Action = (
  prev: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

function useStepAction(action: Action) {
  const [state, formAction] = useActionState(action, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const message = state && !state.ok ? state.error : null;
  return { formAction, errors, message };
}

function Actions({ back, submit }: { back?: string; submit: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-5">
      {back ? (
        <Link href={back} className={BUTTON_SECONDARY}>
          Back
        </Link>
      ) : (
        <span />
      )}
      {submit}
    </div>
  );
}

const CHOICE =
  "flex cursor-pointer items-center gap-3 rounded-[10px] border border-line-soft px-3.5 py-3 text-[14px] transition-colors hover:border-line has-[:checked]:border-ink has-[:checked]:bg-surface-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";
const CHECK = "size-4 flex-none accent-ink";

export function ProgramForm({
  admissionTerm,
  concentrations,
  yearOptions,
}: {
  admissionTerm?: string;
  concentrations?: string[];
  yearOptions: number[];
}) {
  const [savedYear, savedSeason] = admissionTerm?.split("-") ?? [];
  const { formAction, errors, message } = useStepAction(
    saveStep.bind(null, "program"),
  );
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={message} />
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Program</span>
        <p className="rounded-[10px] bg-surface-subtle px-3.5 py-2.5 text-[14px]">
          Bachelor of Business Administration (BBA) · Beedie School of Business
        </p>
        <p className={HINT}>MyAdvisor covers the SFU BBA only for now.</p>
      </div>
      <fieldset
        className="flex flex-col gap-1.5"
        aria-describedby="admission-hint"
      >
        <legend className={cn(LABEL, "mb-1.5")}>
          When were you admitted to the BBA?
        </legend>
        <div className="grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-muted">Season</span>
            <select
              name="admissionSeason"
              defaultValue={savedSeason ?? ""}
              required
              aria-invalid={Boolean(errors.admissionSeason)}
              aria-describedby="admissionSeason-error"
              className={FIELD}
            >
              <option value="" disabled>
                Pick a season
              </option>
              {SEASONS.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-ink-muted">Year</span>
            <select
              name="admissionYear"
              defaultValue={savedYear ?? ""}
              required
              aria-invalid={Boolean(errors.admissionYear)}
              aria-describedby="admissionYear-error"
              className={FIELD}
            >
              <option value="" disabled>
                Pick a year
              </option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p id="admission-hint" className={HINT}>
          Some requirements depend on when you were admitted.
        </p>
        <FieldError
          id="admissionSeason-error"
          message={errors.admissionSeason}
        />
        <FieldError id="admissionYear-error" message={errors.admissionYear} />
      </fieldset>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby="concentrations-hint concentrations-error"
      >
        <legend className={cn(LABEL, "mb-1.5")}>Your concentration</legend>
        <p id="concentrations-hint" className={cn(HINT, "-mt-1 mb-1")}>
          Pick one, or two if you&apos;re doing a double concentration.
        </p>
        <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
          {CONCENTRATIONS.map((c) => (
            <label key={c} className={CHOICE}>
              <input
                type="checkbox"
                name="concentrations"
                value={c}
                defaultChecked={concentrations?.includes(c)}
                className={CHECK}
              />
              {c}
            </label>
          ))}
        </div>
        <FieldError id="concentrations-error" message={errors.concentrations} />
      </fieldset>
      <Actions
        back="/app/start"
        submit={<SubmitButton>Continue</SubmitButton>}
      />
    </form>
  );
}

/**
 * "Are you doing co-op?" and the work terms (up to 3). Posts `coop` (yes/no) and
 * `coopTerms`. Back-to-back terms are fine; none picked means the default placement.
 */
export function CoopFields({
  coop,
  termOptions,
  error,
}: {
  coop?: Coop;
  termOptions: string[];
  error?: string;
}) {
  const picked = coop?.workTerms ?? [];
  const terms = [
    ...picked.filter((t) => !termOptions.includes(t)),
    ...termOptions,
  ];
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby="coop-hint coopTerms-error"
    >
      <legend className={cn(LABEL, "mb-1.5")}>Are you doing co-op?</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className={CHOICE}>
          <input
            type="radio"
            name="coop"
            value="yes"
            defaultChecked={coop?.doing === true}
            className={CHECK}
          />
          Yes
        </label>
        <label className={CHOICE}>
          <input
            type="radio"
            name="coop"
            value="no"
            defaultChecked={coop?.doing !== true}
            className={CHECK}
          />
          No
        </label>
      </div>
      <p className={cn(LABEL, "mt-2")}>
        Work terms, if you know them (up to 3)
      </p>
      <div className="grid grid-cols-3 gap-2 max-[560px]:grid-cols-2">
        {terms.map((t) => (
          <label key={t} className={cn(CHOICE, "py-2.5")}>
            <input
              type="checkbox"
              name="coopTerms"
              value={t}
              defaultChecked={picked.includes(t)}
              aria-invalid={Boolean(error)}
              className={CHECK}
            />
            {termLabel(t)}
          </label>
        ))}
      </div>
      <p id="coop-hint" className={HINT}>
        Back-to-back work terms are fine: Fall + Spring is an 8-month placement,
        and Summer can come before it. Work terms are planned with no courses.
        Leave them blank and we&apos;ll plan a default you can change: Fall +
        Spring, plus one more work term.
      </p>
      <FieldError id="coopTerms-error" message={error} />
    </fieldset>
  );
}

export function NextTermForm({
  planTerm,
  courseLoad,
  coop,
  termOptions,
  coopOptions,
}: {
  planTerm?: string;
  courseLoad?: number;
  coop?: Coop;
  termOptions: string[];
  coopOptions: string[];
}) {
  const { formAction, errors, message } = useStepAction(
    saveStep.bind(null, "next-term"),
  );
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={message} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="planTerm" className={LABEL}>
          Which term should your plan start from?
        </label>
        <select
          id="planTerm"
          name="planTerm"
          defaultValue={planTerm ?? termOptions[0] ?? ""}
          required
          aria-invalid={Boolean(errors.planTerm)}
          aria-describedby="planTerm-error"
          className={FIELD}
        >
          {termOptions.map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <FieldError id="planTerm-error" message={errors.planTerm} />
      </div>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby="courseLoad-error"
      >
        <legend className={cn(LABEL, "mb-1.5")}>
          How many courses do you want to take each term?
        </legend>
        <div className="grid grid-cols-5 gap-2 max-[480px]:grid-cols-3">
          {COURSE_LOADS.map((n) => (
            <label key={n} className={cn(CHOICE, "justify-center")}>
              <input
                type="radio"
                name="courseLoad"
                value={n}
                defaultChecked={(courseLoad ?? 4) === n}
                className={CHECK}
              />
              {n}
            </label>
          ))}
        </div>
        <p className={HINT}>
          A typical full-time term is four or five courses. You can change this
          later.
        </p>
        <FieldError id="courseLoad-error" message={errors.courseLoad} />
      </fieldset>
      <CoopFields
        coop={coop}
        termOptions={coopOptions}
        error={errors.coopTerms}
      />
      <Actions
        back="/app/start/program"
        submit={<SubmitButton>Continue</SubmitButton>}
      />
    </form>
  );
}

export function CoursesForm({
  courses,
  termOptions,
}: {
  courses: RecordCourse[];
  termOptions: string[];
}) {
  const { formAction, errors, message } = useStepAction(
    saveStep.bind(null, "courses"),
  );
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={message ?? errors.courses} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-surface-subtle px-3.5 py-3">
        <p className="text-[13px] text-ink-body">
          Have your unofficial transcript? Upload it and check what we read
          instead.
        </p>
        <Link href="/app/start/upload" className={BUTTON_SECONDARY}>
          Upload a transcript
        </Link>
      </div>
      <CourseEditor
        initial={courses}
        termOptions={termOptions}
        errors={errors}
      />
      <Actions
        back="/app/start/next-term"
        submit={<SubmitButton>Continue</SubmitButton>}
      />
    </form>
  );
}

export function QuestionForm({
  question,
  index,
  total,
  answer,
}: {
  question: SurveyQuestion;
  index: number;
  total: number;
  answer?: string;
}) {
  const { formAction, errors, message } = useStepAction(saveAnswer);
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={message} />
      <input type="hidden" name="questionId" value={question.id} />
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby="why answer-error"
      >
        <legend className="mb-1 text-[17px] font-semibold tracking-[-0.01em]">
          <span className="mb-1 block text-[12px] font-normal text-ink-muted">
            Question {index + 1} of {total}
          </span>
          {question.text}
        </legend>
        <p id="why" className={cn(HINT, "mb-2")}>
          Why I&apos;m asking: {question.why}
        </p>
        {question.options.map((o) => (
          <label key={o.id} className={CHOICE}>
            <input
              type="radio"
              name="answer"
              value={o.id}
              defaultChecked={answer === o.id}
              className={CHECK}
            />
            {o.label}
          </label>
        ))}
        <label className={cn(CHOICE, "text-ink-body")}>
          <input
            type="radio"
            name="answer"
            value={SKIP}
            defaultChecked={answer === SKIP}
            className={CHECK}
          />
          Skip this question
        </label>
        <FieldError id="answer-error" message={errors.answer} />
      </fieldset>
      <Actions
        back={
          index === 0
            ? "/app/start/courses"
            : `/app/start/questions?q=${index - 1}`
        }
        submit={
          <SubmitButton>
            {index + 1 === total ? "Continue" : "Next question"}
          </SubmitButton>
        }
      />
    </form>
  );
}

export function ReviewForm() {
  const { formAction, errors, message } = useStepAction(finishOnboarding);
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={message} />
      <label className={cn(CHOICE, "items-start")}>
        <input
          type="checkbox"
          name="confirm"
          className={cn(CHECK, "mt-0.5")}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby="confirm-error"
        />
        <span>
          I&apos;ve checked my courses, terms and grades, and they&apos;re
          correct.
          <span className={cn(HINT, "mt-0.5 block")}>
            Your degree progress is worked out from this list.
          </span>
        </span>
      </label>
      <FieldError id="confirm-error" message={errors.confirm} />
      <Actions
        back="/app/start/questions"
        submit={
          <SubmitButton
            pendingLabel="Saving your profile…"
            className={BUTTON_BRAND}
          >
            Confirm and see my progress
          </SubmitButton>
        }
      />
    </form>
  );
}

export function SampleStudentForm({ replacing }: { replacing: boolean }) {
  const { formAction, message } = useStepAction(loadSampleStudent);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormError message={message} />
      {replacing && (
        <p className="rounded-[10px] border border-brand/30 bg-brand-wash px-3.5 py-2.5 text-[13px] text-brand">
          This replaces the profile and courses you&apos;ve saved.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <SubmitButton
          pendingLabel="Loading the sample…"
          className={BUTTON_BRAND}
        >
          Use the sample student
        </SubmitButton>
        <Link href="/app/start" className={BUTTON_SECONDARY}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
