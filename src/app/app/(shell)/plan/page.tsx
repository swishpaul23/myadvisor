import Link from "next/link";
import {
  DATA_NOTE,
  NextTermCard,
  SampleDataTag,
  WhyThisPlan,
} from "@/components/app/degree-parts";
import { PlanSettings } from "@/components/app/plan-settings";
import { EmptyPanel } from "@/components/app/states";
import { FOCUS, HINT, KICKER, SCREEN_TITLE } from "@/components/app/styles";
import { getDegreeView } from "@/lib/app/degree";
import { planTermOptions, termLabel } from "@/lib/app/terms";
import { cn } from "@/lib/utils";

export const metadata = { title: "My plan · MyAdvisor" };

/** My plan: the suggested next term, why, and the plan's settings. */
export default async function PlanPage() {
  const view = await getDegreeView();
  if (!view) return null; // the layout redirects to onboarding
  const { profile, plan, suggestion } = view;
  const noneSuggested = suggestion.courses.length === 0;

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className={KICKER}>
            BBA · {profile.concentrations.join(" & ")} · Fall 2026 requirements
          </p>
          <h1 className={cn(SCREEN_TITLE, "mt-1")}>
            My plan · {termLabel(plan.termId)}
          </h1>
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

      {noneSuggested && (
        <EmptyPanel
          title={`No required course to suggest for ${termLabel(plan.termId)}`}
        >
          Every required course you still need either has prerequisites you
          haven&apos;t met yet or didn&apos;t run in this season recently. The
          reasons are listed under &ldquo;Why this plan&rdquo;. Your{" "}
          {profile.courseLoad} slots are open for your choice.
        </EmptyPanel>
      )}

      <div className="grid grid-cols-2 items-start gap-3 max-[900px]:grid-cols-1">
        <NextTermCard plan={plan} link={false} />
        <PlanSettings
          planTerm={profile.planTerm}
          courseLoad={profile.courseLoad}
          termOptions={planTermOptions(new Date())}
        />
      </div>
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
