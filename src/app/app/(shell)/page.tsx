import {
  DATA_NOTE,
  GapCallout,
  NextTermCard,
  RecordCard,
  RequirementChecklist,
  SampleDataTag,
  SourcesList,
  UnitsCard,
  WhyThisPlan,
} from "@/components/app/degree-parts";
import { HINT, KICKER, SCREEN_TITLE } from "@/components/app/styles";
import { getDegreeView } from "@/lib/app/degree";
import { cn } from "@/lib/utils";

export const metadata = { title: "Degree progress · MyAdvisor" };

/** Overview: where the student stands, their main gap and the next-term draft. */
export default async function OverviewPage() {
  const view = await getDegreeView();
  if (!view) return null; // the layout redirects to onboarding
  const { profile, units, checklist, gaps, plan, record, sources } = view;
  const [topGap] = gaps;

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className={KICKER}>
            BBA · {profile.concentrations.join(" & ")} · Fall 2026 requirements
          </p>
          <h1 className={cn(SCREEN_TITLE, "mt-1")}>Degree progress</h1>
        </div>
        {profile.origin === "sample" && <SampleDataTag />}
      </header>
      <p className={HINT}>{DATA_NOTE}</p>

      <UnitsCard units={units} />
      <RequirementChecklist items={checklist} />
      {topGap && <GapCallout gap={topGap} more={gaps.length - 1} />}
      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <NextTermCard plan={plan} />
        <WhyThisPlan claims={plan.claims} limit={3} link />
      </div>
      <RecordCard record={record} />
      <SourcesList sources={sources} />
    </>
  );
}
