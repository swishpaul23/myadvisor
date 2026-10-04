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
import { termLabel } from "@/lib/app/terms";
import {
  CONCENTRATIONS,
  COURSE_LOADS,
  type ActionResult,
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
  termOptions,
}: {
  admissionTerm?: string;
  concentrations?: string[];
  termOptions: string[];
}) {
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="admissionTerm" className={LABEL}>
          When were you admitted to the BBA?
        </label>
        <select
          id="admissionTerm"
          name="admissionTerm"
          defaultValue={admissionTerm ?? ""}
          required
          aria-invalid={Boolean(errors.admissionTerm)}
          aria-describedby="admissionTerm-hint admissionTerm-error"
          className={FIELD}
        >
          <option value="" disabled>
            Pick a term
          </option>
          {termOptions.map((t) => (
            <option key={t} value={t}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <p id="admissionTerm-hint" className={HINT}>
          Some requirements depend on when you were admitted.
        </p>
        <FieldError id="admissionTerm-error" message={errors.admissionTerm} />
      </div>
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

export function NextTermForm({
  planTerm,
  courseLoad,
  termOptions,
}: {
  planTerm?: string;
  courseLoad?: number;
  termOptions: string[];
}) {
  const { formAction, errors, message } = useStepAction(
    saveStep.bind(null, "next-term"),
  );
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={message} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="planTerm" className={LABEL}>
          Which term do you want to plan?
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
          How many courses do you want to take that term?
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
