import type { AuditResult, ReqResult, ReqStatus } from "@/engine/audit/types";
import type { Suggestion } from "@/engine/plan/suggest";
import type { ViolationCode } from "@/engine/plan/types";
import type { Course } from "@/lib/data/catalog";
import type { RequirementRow } from "@/lib/data/schema";
import { termLabel } from "./terms";
import type {
  Claim,
  Gap,
  Plan,
  PlanCourse,
  Source,
  StudentProfile,
} from "./types";

// Turns engine results into what the screens show. Display only: every status comes from
// the audit or the validator; this file never decides whether a requirement is met. Labels
// are derived here because the requirement data has no display names.

// ---------- Sources ----------

const CALENDAR = "https://www.sfu.ca/students/calendar/";

/** A readable title for a calendar URL, e.g. "SFU Calendar · BBA program requirements". */
export function sourceTitle(url: string): string {
  if (url.endsWith("/bachelor-of-business-administration.html"))
    return "SFU Calendar · BBA program requirements";
  if (url.endsWith("/enrolment/WQB.html"))
    return "SFU Calendar · WQB requirements";
  if (url.endsWith("/credentials-offered/definitions.html"))
    return "SFU Calendar · Credential definitions";
  const course = /\/courses\/([a-z]+)\/(\w+)\.html$/i.exec(url);
  if (course)
    return `SFU Calendar · ${course[1]!.toUpperCase()} ${course[2]!.toUpperCase()}`;
  return url.startsWith(CALENDAR) ? "SFU Calendar" : "Source";
}

export const source = (url: string): Source => ({
  title: sourceTitle(url),
  url,
});

/** ASSUMPTION (as in the plan validator): course pages follow the calendar's URL pattern. */
export function courseSource(code: string): Source {
  const [dept, number] = code.toLowerCase().split(" ");
  return source(`${CALENDAR}2026/fall/courses/${dept}/${number}.html`);
}

/** Every distinct source, in first-seen order. */
export function uniqueSources(sources: (Source | undefined)[]): Source[] {
  const seen = new Map<string, Source>();
  for (const s of sources) if (s && !seen.has(s.url)) seen.set(s.url, s);
  return [...seen.values()];
}

// ---------- Labels ----------

const LABELS: Record<string, string> = {
  "lower-foundation": "Business Foundation course",
  "lower-stats": "Statistics course",
  "lower-managerial-economics": "Managerial economics course",
  "lower-microeconomics": "Microeconomics course",
  "lower-macroeconomics": "Macroeconomics course",
  "lower-calculus": "Calculus course",
  "lower-english-philosophy-literature":
    "English, philosophy or literature course",
  "upper-organization-or-hr": "Organization or HR course",
  "upper-global": "Global Perspectives course",
  "upper-400-courses": "400-level BUS courses",
  "upper-400-sfu": "400-level BUS course at SFU",
  "upper-business-units": "Upper-division BUS units",
};

/** What a row is part of, e.g. "Finance concentration" or "BBA upper-division core". */
export function scopeLabel(row: RequirementRow): string {
  if (row.concentration) return `${row.concentration} concentration`;
  if (row.group === "Lower core") return "BBA lower-division core";
  if (row.group === "Upper core") return "BBA upper-division core";
  if (row.group === "University") return "university requirements";
  return "Beedie requirements";
}

/** A short name for one row (display only). */
export function rowLabel(row: RequirementRow): string {
  const known = LABELS[row.req_id];
  if (known) return known;
  if (row.rule === "one course" && row.courses.length === 1)
    return row.courses[0]!;
  if (row.concentration && row.rule === "n courses")
    return `${row.concentration} electives`;
  return row.req_id
    .split("-")
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// ---------- Checklist ----------

export type ItemStatus = "complete" | "in_progress" | "gap" | "unresolved";

export type ChecklistItem = {
  key: string;
  label: string;
  detail: string | null;
  status: ItemStatus;
  reqIds: string[];
};

/** A single required course: an unmet one is a gap (a course not on the record). */
const isSingleCourse = (row: RequirementRow) =>
  row.rule === "one course" && row.courses.length === 1;

/** One row's checklist status, from its audit status. */
export function rowItemStatus(
  row: RequirementRow,
  status: ReqStatus,
): ItemStatus | null {
  if (status === "not_applicable") return null;
  if (status === "met") return "complete";
  if (status === "unknown") return "unresolved";
  if (status === "unmet" && isSingleCourse(row)) return "gap";
  return "in_progress"; // in progress, or unmet units/counts/choices still being worked on
}

const WQB = /^univ-(writing|quant|breadth|wqb)/;

function itemKey(row: RequirementRow): { key: string; label: string } {
  if (row.concentration)
    return {
      key: `conc:${row.concentration}`,
      label: `${row.concentration} concentration`,
    };
  if (row.group === "Lower core")
    return { key: "lower", label: "BBA lower-division core" };
  if (row.group === "Upper core")
    return { key: "upper", label: "BBA upper-division core" };
  if (WQB.test(row.req_id))
    return { key: "wqb", label: "Writing, Quantitative, Breadth" };
  if (row.req_id === "beedie-upper-total" || row.req_id === "univ-upper")
    return { key: "upper-units", label: "Upper-division units" };
  if (row.req_id.startsWith("beedie-nonbus"))
    return { key: "nonbus", label: "Units outside Business" };
  if (row.rule === "minimum GPA" || row.rule === "minimum grade")
    return { key: "gpa", label: "GPA and grades" };
  if (row.req_id === "univ-total")
    return { key: "total", label: "Total units" };
  return { key: "other", label: "Other requirements" };
}

/** The headline row of an item whose detail is "have of need units". */
const UNIT_HEADLINE: Record<string, string> = {
  "upper-units": "beedie-upper-total",
  nonbus: "beedie-nonbus",
  total: "univ-total",
};

const PRECEDENCE: ItemStatus[] = [
  "gap",
  "unresolved",
  "in_progress",
  "complete",
];

function listCodes(codes: string[]): string {
  return codes.length <= 2
    ? codes.join(", ")
    : `${codes.slice(0, 2).join(", ")} +${codes.length - 2}`;
}

/** Display order, as the landing preview: core, concentrations, WQB, units, GPA, rest. */
const ITEM_ORDER = [
  "lower",
  "upper",
  "conc:",
  "wqb",
  "upper-units",
  "nonbus",
  "total",
  "gpa",
  "other",
];
// "upper-units" must not match "upper": exact keys first, then the "conc:" prefix.
const orderOf = (key: string) => {
  const exact = ITEM_ORDER.indexOf(key);
  return exact !== -1 ? exact : key.startsWith("conc:") ? 2 : ITEM_ORDER.length;
};

/** Requirement rows grouped into the Overview checklist, in display order. */
export function buildChecklist(
  rows: RequirementRow[],
  audit: AuditResult,
): ChecklistItem[] {
  const results = new Map(audit.results.map((r) => [r.reqId, r]));
  const items = new Map<
    string,
    ChecklistItem & { rows: [RequirementRow, ItemStatus, ReqResult][] }
  >();
  for (const row of rows) {
    const result = results.get(row.req_id);
    if (!result) continue;
    const status = rowItemStatus(row, result.status);
    if (!status) continue;
    const { key, label } = itemKey(row);
    const item = items.get(key) ?? {
      key,
      label,
      detail: null,
      status: "complete",
      reqIds: [],
      rows: [],
    };
    item.rows.push([row, status, result]);
    item.reqIds.push(row.req_id);
    items.set(key, item);
  }
  const ordered = [...items.values()].sort(
    (a, b) => orderOf(a.key) - orderOf(b.key),
  );
  return ordered.map(({ rows: entries, ...item }) => {
    const status =
      PRECEDENCE.find((s) => entries.some(([, st]) => st === s)) ?? "complete";
    let detail: string | null = null;
    if (status === "gap") {
      detail = `${listCodes(entries.filter(([, st]) => st === "gap").map(([r]) => r.courses[0]!))} missing`;
    } else if (status === "unresolved") {
      detail = "can't be checked automatically";
    } else if (status === "in_progress") {
      const headline = entries.find(
        ([r]) => r.req_id === UNIT_HEADLINE[item.key],
      );
      const p = headline?.[2].progress;
      detail =
        p && p.have !== null
          ? `${p.have} of ${p.need} ${p.unit}`
          : `${entries.filter(([, st]) => st === "complete").length} of ${entries.length} done`;
    }
    return { ...item, status, detail };
  });
}

// ---------- Gaps ----------

/** Unmet single-course rows: required courses not on the record. Concentrations first. */
export function buildGaps(rows: RequirementRow[], audit: AuditResult): Gap[] {
  const status = new Map(audit.results.map((r) => [r.reqId, r.status]));
  const gaps = rows
    .filter((r) => isSingleCourse(r) && status.get(r.req_id) === "unmet")
    .map((r): Gap => ({
      reqId: r.req_id,
      label: r.courses[0]!,
      courses: [r.courses[0]!],
      detail: `Required for the ${scopeLabel(r)}. Not on your record yet.`,
      source: source(r.source_url),
    }));
  const conc = (g: Gap) =>
    rows.find((r) => r.req_id === g.reqId)?.concentration ? 0 : 1;
  return gaps.sort((a, b) => conc(a) - conc(b)); // stable: sheet order within each
}

// ---------- Units and record ----------

export type UnitsSummary = {
  completed: number;
  inProgress: number;
  required: number | null;
};

export function unitsSummary(audit: AuditResult): UnitsSummary {
  const total = audit.results.find((r) => r.reqId === "univ-total");
  return {
    completed: audit.summary.earnedUnits,
    inProgress: audit.summary.inProgressUnits,
    required: total?.progress.need ?? null,
  };
}

export type RecordSummary = {
  completed: { courses: number; units: number };
  inProgress: { courses: number; units: number };
  transfer: { courses: number; units: number };
  confirmed: boolean;
};

/** Course and unit totals, keeping completed, in-progress and transfer apart. */
export function recordSummary(
  profile: StudentProfile,
  audit: AuditResult,
  courses: Course[],
): RecordSummary {
  const unitsOf = new Map(courses.map((c) => [c.code, c.units]));
  const units = (c: StudentProfile["courses"][number]) =>
    unitsOf.get(c.code) ?? c.units ?? 0;
  const distinct = (list: StudentProfile["courses"]) =>
    new Set(list.map((c) => c.code)).size;
  const done = profile.courses.filter((c) => c.status === "completed");
  const now = profile.courses.filter((c) => c.status === "in_progress");
  const transfer = profile.courses.filter((c) => c.institution === "transfer");
  return {
    completed: { courses: distinct(done), units: audit.summary.earnedUnits },
    inProgress: {
      courses: distinct(now),
      units: audit.summary.inProgressUnits,
    },
    transfer: {
      courses: distinct(transfer),
      units: transfer.reduce((n, c) => n + units(c), 0),
    },
    confirmed: profile.recordConfirmed,
  };
}

// ---------- Plan and claims ----------

const ASSUMPTION_NOTE = /ASSUMPTION/;
/** Validator reasons that mean "can't be checked automatically", not "no". */
const CANNOT_CHECK: ViolationCode[] = [
  "PREREQ_UNKNOWN",
  "PREREQ_NEEDS_PERMISSION",
  "COREQ_UNKNOWN",
  "NO_COURSE_DATA",
];
const REASON_TEXT: Partial<Record<ViolationCode, string>> = {
  PREREQ_UNMET: "its prerequisites aren't met yet",
  COREQ_UNMET: "its corequisites aren't met",
  NOT_OFFERED_RECENTLY: "it hasn't run in this season recently",
  NOT_OFFERED_FUTURE_ONLY: "it's only listed for a future term, not confirmed",
  ALREADY_TAKEN: "it's already on your record",
  ENTRY_GPA: "your BUS GPA is below the 2.30 entry requirement",
};

/**
 * "X is required for Y and isn't on your record." VERIFIED when the engine decided it from a
 * calendar-sourced row. If the student has an attempt of the course and the row carries an
 * engine ASSUMPTION note (e.g. which grade counts), the decision rests on that assumption.
 */
export function requiredCourseClaim(
  code: string,
  row: RequirementRow,
  result: ReqResult | undefined,
  profile: StudentProfile,
): Claim {
  const attempted = profile.courses.some((c) => c.code === code);
  const assumed =
    attempted && (result?.notes ?? []).some((n) => ASSUMPTION_NOTE.test(n));
  return {
    text: `${code} is required for the ${scopeLabel(row)} and ${attempted ? "your attempt doesn't count toward it" : "isn't on your record"}.`,
    status: assumed ? "assumption" : "verified",
    source: source(row.source_url),
  };
}

/** Claims for a skipped candidate: a firm "no" is VERIFIED; "can't check" is UNRESOLVED. */
export function skippedClaim(
  skipped: Suggestion["skipped"][number],
  row: RequirementRow | undefined,
): Claim {
  const scope = row ? scopeLabel(row) : "a requirement";
  if (skipped.reasons.some((r) => CANNOT_CHECK.includes(r))) {
    return {
      text: `${skipped.code} would count toward the ${scope}, but its prerequisites can't be checked automatically. Check with an advisor.`,
      status: "unresolved",
      source: courseSource(skipped.code),
    };
  }
  const why = skipped.reasons.map((r) => REASON_TEXT[r]).filter(Boolean);
  return {
    text: `${skipped.code} isn't suggested yet: ${why.join("; ") || "the plan check found a problem"}.`,
    status: "verified",
    source: courseSource(skipped.code),
  };
}

const ORDER: Record<Claim["status"], number> = {
  verified: 0,
  assumption: 1,
  unresolved: 2,
};

/** The suggested next term, ready to show, with every claim labelled. */
export function presentPlan(
  suggestion: Suggestion,
  rows: RequirementRow[],
  audit: AuditResult,
  profile: StudentProfile,
  courses: Course[],
): Plan {
  const rowById = new Map(rows.map((r) => [r.req_id, r]));
  const resultById = new Map(audit.results.map((r) => [r.reqId, r]));
  const unitsOf = new Map(courses.map((c) => [c.code, c.units]));
  const term = termLabel(suggestion.termId);
  const season = suggestion.termId.split("-")[1]!;

  const planCourses: PlanCourse[] = suggestion.courses.map(
    ({ code, reqIds }) => {
      const row = rowById.get(reqIds[0]!);
      return {
        code,
        label: code,
        note: row ? `Closes gap · ${scopeLabel(row)}` : "Closes gap",
        units: unitsOf.get(code) ?? null,
        closesGap: true,
      };
    },
  );
  if (suggestion.openSlots > 0) {
    planCourses.push({
      code: null,
      label:
        suggestion.openSlots === 1
          ? "Open elective"
          : `${suggestion.openSlots} × open electives`,
      note: "Your choice",
      units: null,
      closesGap: false,
    });
  }

  const claims: Claim[] = [];
  for (const { code, reqIds } of suggestion.courses) {
    const row = rowById.get(reqIds[0]!);
    if (row)
      claims.push(
        requiredCourseClaim(code, row, resultById.get(row.req_id), profile),
      );
  }
  if (suggestion.courses.length > 0) {
    claims.push({
      text: `Prerequisites for ${suggestion.courses.map((c) => c.code).join(", ")} are met by your record.`,
      status: "verified",
      source: courseSource(suggestion.courses[0]!.code),
    });
  }
  const choices = rows.filter(
    (r) =>
      !isSingleCourse(r) &&
      (r.rule === "one course" || r.rule === "n courses") &&
      r.courses.length > 0 &&
      resultById.get(r.req_id)?.status === "unmet",
  );
  if (choices.length > 0) {
    claims.push({
      text: `Still to choose: ${choices.map(rowLabel).join(", ")}. These have several options, so they're left to you.`,
      status: "verified",
      source: source(choices[0]!.source_url),
    });
  }
  for (const s of suggestion.skipped)
    claims.push(skippedClaim(s, rowById.get(s.reqIds[0]!)));

  const inProgress = profile.courses.filter((c) => c.status === "in_progress");
  if (inProgress.length > 0) {
    claims.push({
      text: `Your in-progress courses (${listCodes(inProgress.map((c) => c.code))}) are assumed passed before ${term}.`,
      status: "assumption",
    });
  }
  if (suggestion.courses.length > 0) {
    claims.push({
      text: `Offerings are estimated from past ${season} terms; the ${term} timetable isn't confirmed.`,
      status: "assumption",
    });
  }
  claims.push({
    text: `${profile.courseLoad} courses is the load you chose.`,
    status: "assumption",
  });
  for (const v of suggestion.validation.violations) {
    if (v.code === "UNIT_LOAD_LOW" || v.code === "UNIT_LOAD_HIGH")
      claims.push({
        text: `${v.message.replace(/\s*\(ASSUMPTION[^)]*\)/, "")} (unit limits not yet confirmed against the calendar).`.replace(
          ". (",
          " (",
        ),
        status: "assumption",
      });
  }
  claims.push({
    text: "Seats and timetable fit aren't checked yet.",
    status: "unresolved",
  });

  return {
    termId: suggestion.termId,
    courses: planCourses,
    units: suggestion.validation.terms[0]?.units ?? null,
    claims: claims.sort((a, b) => ORDER[a.status] - ORDER[b.status]),
  };
}
