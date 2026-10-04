import { RecordCard, SampleDataTag } from "@/components/app/degree-parts";
import { RecordEditor } from "@/components/app/record-editor";
import { EmptyPanel } from "@/components/app/states";
import {
  KICKER,
  PANEL,
  PANEL_TITLE,
  SCREEN_TITLE,
} from "@/components/app/styles";
import { getDegreeView } from "@/lib/app/degree";
import { recordTermOptions, termIndex, termLabel } from "@/lib/app/terms";
import type { RecordCourse } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Academic record · MyAdvisor" };

const ORIGIN: Record<string, string> = {
  sample: "Sample student record",
  transcript: "From your uploaded transcript, reviewed by you",
  manual: "Entered by you",
};

function CourseTable({
  title,
  courses,
  unitsOf,
  elective,
  empty,
}: {
  title: string;
  courses: RecordCourse[];
  unitsOf: (c: RecordCourse) => number | null;
  /** Codes outside the course data, counted as elective credit. */
  elective: ReadonlySet<string>;
  empty: string;
}) {
  return (
    <section aria-label={title} className={PANEL}>
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
        <h2 className={PANEL_TITLE}>{title}</h2>
        <span className="text-[12px] text-ink-muted">
          {courses.length} {courses.length === 1 ? "course" : "courses"}
        </span>
      </div>
      {courses.length === 0 ? (
        <p className="px-4 py-3 text-ink-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-normal">
                  Course
                </th>
                <th scope="col" className="px-4 py-2 font-normal">
                  Term
                </th>
                <th scope="col" className="px-4 py-2 font-normal">
                  Grade
                </th>
                <th scope="col" className="px-4 py-2 text-right font-normal">
                  Units
                </th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c, i) => (
                <tr
                  key={`${c.code}-${c.term}-${i}`}
                  className="border-t border-line-soft"
                >
                  <th scope="row" className="px-4 py-2.5 font-medium">
                    {c.code}
                    {elective.has(c.code) && (
                      <span className="block text-[12px] font-normal text-ink-muted">
                        Elective credit · not in MyAdvisor&apos;s course data
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-2.5 text-ink-body">
                    {termLabel(c.term)}
                  </td>
                  <td className="px-4 py-2.5 text-ink-body">
                    {c.grade ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-ink-body">
                    {unitsOf(c) ?? "?"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Academic record: completed, in progress and transfer kept apart, and editable. */
export default async function RecordPage() {
  const view = await getDegreeView();
  if (!view) return null; // the layout redirects to onboarding
  const { profile, record, catalogUnits, audit } = view;
  const electiveUnits = new Map(
    audit.summary.electiveCredit.map((e) => [e.code, e.units]),
  );
  const elective = new Set(electiveUnits.keys());
  const unitsOf = (c: RecordCourse) =>
    catalogUnits[c.code] ?? c.units ?? electiveUnits.get(c.code) ?? null;
  const byTerm = (a: RecordCourse, b: RecordCourse) =>
    termIndex(a.term) - termIndex(b.term) || a.code.localeCompare(b.code);
  const sorted = [...profile.courses].sort(byTerm);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className={KICKER}>{ORIGIN[profile.origin]}</p>
          <h1 className={cn(SCREEN_TITLE, "mt-1")}>Academic record</h1>
        </div>
        {profile.origin === "sample" && <SampleDataTag />}
      </header>

      {profile.courses.length === 0 ? (
        <EmptyPanel title="No courses on your record yet">
          Add the courses you&apos;ve completed or are taking now, and your
          degree progress will appear on the Overview.
        </EmptyPanel>
      ) : (
        <>
          <RecordCard record={record} link={false} />
          <CourseTable
            title="Completed at SFU"
            courses={sorted.filter(
              (c) => c.status === "completed" && c.institution === "SFU",
            )}
            unitsOf={unitsOf}
            elective={elective}
            empty="No completed SFU courses."
          />
          <CourseTable
            title="In progress"
            courses={sorted.filter((c) => c.status === "in_progress")}
            unitsOf={unitsOf}
            elective={elective}
            empty="No courses in progress."
          />
          <CourseTable
            title="Transfer credit"
            courses={sorted.filter(
              (c) => c.status === "completed" && c.institution === "transfer",
            )}
            unitsOf={unitsOf}
            elective={elective}
            empty="No transfer credit."
          />
        </>
      )}
      <RecordEditor
        courses={profile.courses}
        termOptions={recordTermOptions(new Date())}
      />
    </>
  );
}
