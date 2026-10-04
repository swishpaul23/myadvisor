import { connection } from "next/server";
import { AdvisorChat } from "@/components/app/advisor-chat";
import { SampleDataTag } from "@/components/app/degree-parts";
import { KICKER, SCREEN_TITLE } from "@/components/app/styles";
import { voiceAvailability } from "@/lib/ai/elevenlabs";
import { readGoogleGenerativeAiApiKey } from "@/lib/ai/google";
import { introMessage } from "@/lib/app/advisor";
import { getDegreeView } from "@/lib/app/degree";
import { termLabel } from "@/lib/app/terms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Advisor · MyAdvisor" };

/** Advisor: text and voice chat grounded in the student's profile, progress and plan. */
export default async function AdvisorPage() {
  await connection();
  const view = await getDegreeView();
  if (!view) return null; // the layout redirects to onboarding
  const { profile, plan, gaps } = view;
  const inProgress = profile.courses.find((c) => c.status === "in_progress");
  const starters = [
    gaps[0] && `Why do I need ${gaps[0].label}?`,
    `What's left for my ${profile.concentrations[0]} concentration?`,
    `Why is this my ${termLabel(plan.termId)} plan?`,
    inProgress && `Do I still need ${inProgress.code}?`,
  ].filter((q): q is string => Boolean(q));
  const voice = voiceAvailability();

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className={KICKER}>
            {voice.listen ? "Ask by typing or speaking. " : ""}Grounded in your
            progress, your plan and the SFU calendar
          </p>
          <h1 className={cn(SCREEN_TITLE, "mt-1")}>Advisor</h1>
        </div>
        {profile.origin === "sample" && <SampleDataTag />}
      </header>
      <AdvisorChat
        intro={introMessage(profile, plan)}
        starters={starters}
        available={Boolean(readGoogleGenerativeAiApiKey())}
        voice={voice}
      />
    </>
  );
}
