import { SampleStudentForm } from "@/components/app/onboarding-forms";
import { HINT, PANEL, SCREEN_TITLE } from "@/components/app/styles";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import { readState } from "@/lib/app/store";
import { termLabel } from "@/lib/app/terms";
import { cn } from "@/lib/utils";

export const metadata = { title: "Sample student · MyAdvisor" };

/** Confirmation before loading the sample (a link can't change saved data by itself). */
export default async function SamplePage() {
  const { profile, draft } = await readState();
  const p = SAMPLE_PROFILE;
  const completed = p.courses.filter((c) => c.status === "completed").length;
  const inProgress = p.courses.length - completed;
  return (
    <div className={cn(PANEL, "flex flex-col gap-5 p-5 sm:p-7")}>
      <div>
        <h1 className={SCREEN_TITLE}>Try the sample student</h1>
        <p className="mt-1 text-[14px] leading-[1.5] text-ink-body">
          A fictional BBA student, so you can explore MyAdvisor without entering
          your own record. Everything is worked out the same way as for a real
          student.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          ["Concentration", p.concentrations.join(", ")],
          ["Admitted", termLabel(p.admissionTerm)],
          ["Courses", `${completed} completed · ${inProgress} in progress`],
        ].map(([label, value]) => (
          <li
            key={label}
            className="rounded-[10px] bg-surface-subtle px-3.5 py-3"
          >
            <p className="text-[12px] text-ink-muted">{label}</p>
            <p className="mt-1 text-[14px] font-medium">{value}</p>
          </li>
        ))}
      </ul>
      <p className={HINT}>
        Sample data. It isn&apos;t anyone&apos;s real transcript.
      </p>
      <SampleStudentForm replacing={Boolean(profile || draft)} />
    </div>
  );
}
