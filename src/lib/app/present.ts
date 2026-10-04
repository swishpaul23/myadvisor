import type { AuditResult, ReqResult, ReqStatus } from "@/engine/audit/types";
import type {
  ElectiveSlot,
  RemainingPlan,
  SummerChoice,
} from "@/engine/plan/remaining";
import type { ViolationCode } from "@/engine/plan/types";
import type { Course } from "@/lib/data/catalog";
import type { RequirementRow } from "@/lib/data/schema";
import { termLabel } from "./terms";
import type {
  Claim,
  Gap,
  Plan,
  PlanCourse,
  PlanTermView,
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
  "univ-total": "Total units",
  "univ-upper": "Upper-division units",
  "beedie-upper-total": "Upper-division units (Beedie)",
  "beedie-nonbus": "Units outside Business",
  "beedie-nonbus-electives-total": "Group A and B units",
  "univ-writing": "Writing (W) units",
  "univ-quant": "Quantitative (Q) units",
  "univ-breadth-social": "Social Sciences breadth (B-Soc)",
  "univ-breadth-humanities": "Humanities breadth (B-Hum)",
  "univ-breadth-science": "Science breadth (B-Sci)",
  "univ-breadth-additional": "Additional breadth",
  "univ-breadth-total": "Breadth units",
  "beedie-nonbus-group-a": "Group A course outside Business",
  "beedie-nonbus-group-b": "Group B course (Indigenous perspective)",
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

/** A course no term could take: a firm "no" is VERIFIED; "can't check" is UNRESOLVED. */
export function skippedClaim(
  skipped: RemainingPlan["unscheduled"][number],
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
    text: `${skipped.code} couldn't be placed in any term: ${why.join("; ") || "the plan check found a problem"}.`,
    status: "verified",
    source: courseSource(skipped.code),
  };
}

const ORDER: Record<Claim["status"], number> = {
  verified: 0,
  assumption: 1,
  unresolved: 2,
};

/** What the plan was built from, beyond the profile (display only). */
export type PlanContext = {
  summer: SummerChoice;
  /** The student wasn't sure about summer (or skipped the question): summer is left out. */
  summerUnsure: boolean;
  /** Units per study term the calendar allows (policy unit_load, an ASSUMPTION). */
  unitLoad: Record<string, { min: number; max: number }>;
  /** Units a placeholder elective is assumed to carry (policy unknown_course). */
  electiveUnits: number;
  /** Co-op work terms in the plan; isDefault when the student picked none. */
  coop: { doing: boolean; terms: string[]; isDefault: boolean };
};

const DESIGNATION_LABEL: Record<string, string> = {
  W: "Writing (W)",
  Q: "Quantitative (Q)",
  "B-Soc": "Social Sciences breadth (B-Soc)",
  "B-Hum": "Humanities breadth (B-Hum)",
  "B-Sci": "Science breadth (B-Sci)",
};
const LEVEL_LABEL = {
  "400": "400-level",
  upper: "Upper-division",
  lower: "Lower-division",
} as const;

/** A placeholder elective's name, from what it must be. */
export function electiveLabel(
  slot: ElectiveSlot,
  rowById: Map<string, RequirementRow>,
): string {
  const list = slot.fromList ? rowById.get(slot.fromList) : undefined;
  if (list) return rowLabel(list);
  const level = slot.level ? LEVEL_LABEL[slot.level] : null;
  if (slot.designation) {
    const kind = DESIGNATION_LABEL[slot.designation] ?? slot.designation;
    const qualifier = [
      level?.toLowerCase(),
      slot.business === true ? "BUS" : null,
    ]
      .filter(Boolean)
      .join(" ");
    return `${kind} course${qualifier ? `, ${qualifier}` : ""}${slot.business === false ? ", outside Business" : ""}`;
  }
  if (slot.business === true) return `${level ? `${level} ` : ""}BUS elective`;
  const outside = slot.business === false ? " outside Business" : "";
  if (level) return `${level} elective${outside}`;
  return outside ? "Elective outside Business" : "Open elective";
}

const unitsOrNull = (list: (number | null)[]) =>
  list.reduce<number | null>(
    (n, u) => (n === null || u === null ? null : n + u),
    0,
  );

/**
 * The multi-term plan, ready to show: every term from the start term, the first term as the
 * next-term draft, and every claim labelled. Display only: the planner and validator decide.
 */
export function presentPlan(
  remaining: RemainingPlan,
  rows: RequirementRow[],
  audit: AuditResult,
  profile: StudentProfile,
  courses: Course[],
  context: PlanContext,
): Plan {
  const rowById = new Map(rows.map((r) => [r.req_id, r]));
  const resultById = new Map(audit.results.map((r) => [r.reqId, r]));
  const unitsOf = new Map(courses.map((c) => [c.code, c.units]));
  const labelOf = (id: string) => {
    const row = rowById.get(id);
    return row ? rowLabel(row) : id;
  };

  const terms: PlanTermView[] = remaining.terms.map((t) => {
    const items = t.items.map((item): PlanCourse => {
      if (item.kind === "course") {
        const row = rowById.get(item.reqIds[0]!);
        return {
          code: item.code,
          label: item.code,
          note: item.choice
            ? `One option for ${row ? rowLabel(row) : "a requirement"} · you can swap it`
            : row
              ? `Closes gap · ${scopeLabel(row)}`
              : "Closes gap",
          units: unitsOf.get(item.code) ?? null,
          closesGap: !item.choice,
        };
      }
      const toward = item.reqIds.slice(0, 2).map(labelOf).join(", ");
      return {
        code: null,
        label: electiveLabel(item.slot, rowById),
        note: toward ? `Your choice · counts toward ${toward}` : "Your choice",
        units: context.electiveUnits,
        closesGap: false,
      };
    });
    return {
      termId: t.id,
      kind: t.kind,
      courses: items,
      units: t.kind === "coop" ? 0 : unitsOrNull(items.map((c) => c.units)),
    };
  });
  const first = terms[0];
  const start = profile.planTerm;
  const finishTerm =
    remaining.unscheduled.length === 0 && remaining.notPlannable.length === 0
      ? ([...terms].reverse().find((t) => t.kind === "study")?.termId ?? null)
      : null;

  // ---- claims ----
  const claims: Claim[] = [];
  const named = remaining.terms.flatMap((t) =>
    t.items.flatMap((i) => (i.kind === "course" ? [i] : [])),
  );
  for (const item of named.filter((i) => !i.choice)) {
    const row = rowById.get(item.reqIds[0]!);
    if (row)
      claims.push(
        requiredCourseClaim(
          item.code,
          row,
          resultById.get(row.req_id),
          profile,
        ),
      );
  }
  const prereqProblems = remaining.validation.violations.filter(
    (v) => v.code === "PREREQ_UNMET" || v.code === "COREQ_UNMET",
  );
  if (named.length > 0 && prereqProblems.length === 0) {
    claims.push({
      text: "Each course comes after the courses it needs: prerequisites are checked term by term.",
      status: "verified",
      source: courseSource(named[0]!.code),
    });
  }
  const unchecked = [
    ...new Set(
      remaining.validation.violations
        .filter((v) => v.courseCode && CANNOT_CHECK.includes(v.code))
        .map((v) => v.courseCode!),
    ),
  ];
  for (const code of unchecked) {
    claims.push({
      text: `${code}: its prerequisites can't be checked automatically. Check with an advisor.`,
      status: "unresolved",
      source: courseSource(code),
    });
  }
  const choices = named.filter((i) => i.choice);
  if (choices.length > 0) {
    claims.push({
      text: `${listCodes(choices.map((c) => c.code))} ${choices.length === 1 ? "is" : "are"} picked from a list of options; you can swap ${choices.length === 1 ? "it" : "them"} for another option.`,
      status: "assumption",
      source: source(
        rowById.get(choices[0]!.reqIds[0]!)?.source_url ?? CALENDAR,
      ),
    });
  }
  const electives = terms.flatMap((t) =>
    t.courses.filter((c) => c.code === null),
  );
  if (electives.length > 0) {
    claims.push({
      text: `${electives.length} ${electives.length === 1 ? "elective is a placeholder" : "electives are placeholders"} for requirements that count units, levels or designations, ${context.electiveUnits} units each.`,
      status: "assumption",
    });
  }
  for (const u of remaining.unscheduled)
    claims.push(skippedClaim(u, rowById.get(u.reqIds[0]!)));
  if (remaining.notPlannable.length > 0) {
    const ids = remaining.notPlannable.map((n) => n.reqId);
    claims.push({
      text: `Adding courses can't settle ${ids.length === 1 ? "this" : "these"}: ${ids.slice(0, 4).map(labelOf).join(", ")}${ids.length > 4 ? ` +${ids.length - 4}` : ""}. Check with an advisor.`,
      status: "unresolved",
      source: source(rowById.get(ids[0]!)?.source_url ?? CALENDAR),
    });
  }
  const inProgress = profile.courses.filter((c) => c.status === "in_progress");
  if (inProgress.length > 0) {
    claims.push({
      text: `Your in-progress courses (${listCodes(inProgress.map((c) => c.code))}) are assumed passed before ${termLabel(start)}.`,
      status: "assumption",
    });
  }
  if (named.length > 0) {
    claims.push({
      text: "Offerings are estimated from past terms of the same season; no future timetable is confirmed.",
      status: "assumption",
    });
  }
  claims.push({
    text: `${profile.courseLoad} courses per term is the load you chose${context.summer === "some" ? " (up to 2 in summer)" : ""}.`,
    status: "assumption",
  });
  const light: string[] = [];
  const heavy: string[] = [];
  for (const t of terms) {
    const load = context.unitLoad[t.termId.split("-")[1]!];
    if (t.kind !== "study" || t.units === null || !load) continue;
    if (t.units < load.min) light.push(termLabel(t.termId));
    if (t.units > load.max) heavy.push(termLabel(t.termId));
  }
  const limits = Object.values(context.unitLoad)[0];
  if (light.length > 0 && limits)
    claims.push({
      text: `${light.join(", ")} ${light.length === 1 ? "is" : "are"} below the ${limits.min}-unit minimum (unit limits not yet confirmed against the calendar).`,
      status: "assumption",
    });
  if (heavy.length > 0 && limits)
    claims.push({
      text: `${heavy.join(", ")} ${heavy.length === 1 ? "is" : "are"} above the ${limits.max}-unit maximum (unit limits not yet confirmed against the calendar).`,
      status: "assumption",
    });
  if (context.coop.isDefault)
    claims.push({
      text: "The default co-op placement starts after at least one study term; the SFU calendar's co-op timing rules aren't checked.",
      status: "assumption",
    });
  claims.push({
    text: "Seats and timetable fit aren't checked yet.",
    status: "unresolved",
  });

  // ---- neutral notes about the settings ----
  const notes: string[] = [];
  const { coop } = context;
  if (coop.doing && coop.isDefault) {
    const [fall, spring, third] = coop.terms.map(termLabel);
    notes.push(
      `Co-op work terms are a default: an 8-month placement (${fall} + ${spring}) and ${third}. Pick your own in Plan settings.`,
    );
  } else if (coop.doing && coop.terms.length < 3)
    notes.push(
      `Co-op has 3 work terms; you've picked ${coop.terms.length}. Add the others in Plan settings when you know them.`,
    );
  if (context.summerUnsure)
    notes.push(
      "Summer terms are left out because you weren't sure about summer courses. Choose a summer option in Plan settings to include them.",
    );

  return {
    termId: first?.termId ?? start,
    courses: first?.courses ?? [],
    units: first?.units ?? null,
    claims: claims.sort((a, b) => ORDER[a.status] - ORDER[b.status]),
    terms,
    notes,
    finishTerm,
  };
}
