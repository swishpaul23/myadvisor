import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BUTTON_SECONDARY,
  KICKER,
  PANEL,
  SCREEN_TITLE,
} from "@/components/app/styles";
import { readState } from "@/lib/app/store";
import { cn } from "@/lib/utils";

// Interim home until the Overview screen (screen 3) replaces this file: students without a
// profile start onboarding; students with one see what was saved.
export default async function AppHome() {
  const { profile } = await readState();
  if (!profile) redirect("/app/start");
  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-12 sm:px-6">
      <div className={cn(PANEL, "flex flex-col gap-3 p-6")}>
        <p className={KICKER}>
          BBA · {profile.concentrations.join(" and ")}
          {profile.origin === "sample" ? " · Sample student" : ""}
        </p>
        <h1 className={SCREEN_TITLE}>Profile saved</h1>
        <p className="text-ink-body">
          {profile.courses.length} courses on your record.
        </p>
        <Link href="/app/start" className={cn(BUTTON_SECONDARY, "self-start")}>
          Start again
        </Link>
      </div>
    </main>
  );
}
