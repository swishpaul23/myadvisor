import Link from "next/link";
import {
  DATA_NOTE,
  PlanGrid,
  SampleDataTag,
  WhyThisPlan,
} from "@/components/app/degree-parts";
import { PlanSettings } from "@/components/app/plan-settings";
import { EmptyPanel } from "@/components/app/states";
import { FOCUS, HINT, KICKER, SCREEN_TITLE } from "@/components/app/styles";
import { getDegreeView } from "@/lib/app/degree";
import { coopTermOptions, planTermOptions, termLabel } from "@/lib/app/terms";
import { cn } from "@/lib/utils";

export const metadata = { title: "My plan · MyAdvisor" };

/** My plan: every term from the selected start term, why, and the plan's settings. */
export default async function PlanPage() {
  const view = await getDegreeView();
  if (!view) return null; // the layout redirects to onboarding
  const { profile, plan } = view;

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className={KICKER}>
            BBA · {profile.concentrations.join(" & ")} · Fall 2026 calendar ·
            admitted {termLabel(profile.admissionTerm)}
          </p>
          <h1 className={cn(SCREEN_TITLE, "mt-1")}>
            My plan · from {termLabel(plan.termId)}
          </h1>
          <p className="mt-1 text-[13px] text-ink-body">
            {plan.finishTerm
              ? `Plans your remaining requirements through ${termLabel(plan.finishTerm)}.`
              : "Some requirements can't be planned automatically. See “Why this plan”."}
          </p>
        </div>
        {profile.origin === "sample" && <SampleDataTag />}
      </header>
      <p
        role="note"
        className="rounded-[10px] border border-line-soft bg-surface-subtle px-3.5 py-2.5 text-[13px] font-medium"
      >
        A plan, not enrolment. Seats and timetable aren&apos;t checked.
      </p>
      <p className={HINT}>{DATA_NOTE}</p>
      {plan.notes.map((note) => (
        <p key={note} role="note" className={HINT}>
          {note}
        </p>
      ))}

      <PlanSettings
        planTerm={profile.planTerm}
        courseLoad={profile.courseLoad}
        summer={profile.surveyAnswers.summer}
        coop={profile.coop}
        termOptions={planTermOptions(new Date())}
        coopOptions={coopTermOptions(new Date())}
      />
      {plan.terms.length === 0 ? (
        <EmptyPanel title="Nothing left to plan">
          Every requirement MyAdvisor can plan is already on your record or in
          progress.
        </EmptyPanel>
      ) : (
        <PlanGrid terms={plan.terms} />
      )}
      <WhyThisPlan claims={plan.claims} />
      <p className={HINT}>
        Want to talk it through?{" "}
        <Link
          href="/app/advisor"
          className={cn("text-ink underline underline-offset-2", FOCUS)}
        >
          Ask the advisor
        </Link>
        .
      </p>
    </>
  );
}
