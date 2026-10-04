import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BUTTON_PRIMARY, PANEL, SCREEN_TITLE } from "@/components/app/styles";
import { TranscriptUpload } from "@/components/app/transcript-upload";
import { readGoogleGenerativeAiApiKey } from "@/lib/ai/google";
import { readState } from "@/lib/app/store";
import { recordTermOptions } from "@/lib/app/terms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Upload a transcript · MyAdvisor" };

export default async function UploadPage() {
  await connection(); // the key is checked per request, not frozen at build time
  // Onboarding is done once; after that, courses are edited in Academic record.
  if ((await readState()).profile) redirect("/app");
  const available = Boolean(readGoogleGenerativeAiApiKey());
  return (
    <div className={cn(PANEL, "flex flex-col gap-6 p-5 sm:p-7")}>
      <div>
        <h1 className={SCREEN_TITLE}>Upload a transcript</h1>
        <p className="mt-1 text-[14px] leading-[1.5] text-ink-body">
          We read the courses from your SFU transcript. You check every one
          before it&apos;s used.
        </p>
      </div>
      {available ? (
        <TranscriptUpload termOptions={recordTermOptions(new Date())} />
      ) : (
        <div role="status" className="flex flex-col items-start gap-3">
          <p className="rounded-[10px] border border-brand/30 bg-brand-wash px-3.5 py-2.5 text-[13px] text-brand">
            Upload unavailable, enter courses manually.
          </p>
          <Link href="/app/start/courses" className={BUTTON_PRIMARY}>
            Enter my courses
          </Link>
        </div>
      )}
    </div>
  );
}
