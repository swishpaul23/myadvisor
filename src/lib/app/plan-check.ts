import { audit } from "@/engine/audit/audit";
import type { AuditResult } from "@/engine/audit/types";
import { planRemaining, type RemainingPlan } from "@/engine/plan/remaining";
import type { PlanCatalog, Violation } from "@/engine/plan/types";
import { validatePlan } from "@/engine/plan/validate";
import {
  coopTerms,
  summerChoice,
  toEngineStudent,
  toPlanOptions,
} from "./engine-input";
import {
  boardFromPlan,
  isElectiveId,
  type BoardItem,
  type BoardTerm,
} from "./plan-board";
import { presentPlan } from "./present";
import type { Plan, StudentProfile } from "./types";

// The rules engine behind My plan: the generated plan, and the validator's verdict on a
// board the student has rearranged. The validator decides; this file only words its result
// for the cards and attaches it to the right rows.

/** The generated multi-term plan for a profile, as the screens show it. */
export function planFor(
  profile: StudentProfile,
  catalog: PlanCatalog,
  result: AuditResult = audit(toEngineStudent(profile), catalog),
): { remaining: RemainingPlan; plan: Plan } {
  const student = toEngineStudent(profile);
  const remaining = planRemaining(student, catalog, toPlanOptions(profile));
  const plan = presentPlan(
    remaining,
    catalog.requirements,
    result,
    profile,
    catalog.courses,
    {
      summer: summerChoice(profile).summer,
      summerUnsure: summerChoice(profile).unsure,
      unitLoad: catalog.policy.unit_load,
      electiveUnits: catalog.policy.unknown_course.units,
      coop: { doing: profile.coop.doing, ...coopTerms(profile) },
    },
  );
  return { remaining, plan };
}

/**
 * Rows for every id on a board: the generated plan's items, plus any a saved plan still
 * holds that the generated plan no longer has (an out-of-date plan): a course from the
 * course data, or a generic elective.
 */
export function boardItemsFor(
  plan: Plan,
  catalog: PlanCatalog,
  ids: string[],
): Record<string, BoardItem> {
  const courses = new Map(catalog.courses.map((c) => [c.code, c]));
  const items: Record<string, BoardItem> = {};
  for (const [id, item] of Object.entries(boardFromPlan(plan).items))
    items[id] = {
      ...item,
      title: item.code ? (courses.get(item.code)?.title ?? null) : null,
    };
  for (const id of ids) {
    if (items[id]) continue;
    items[id] = isElectiveId(id)
      ? {
          id,
          code: null,
          title: null,
          label: "Elective",
          note: "Your choice",
          units: catalog.policy.unknown_course.units,
          closesGap: false,
        }
      : {
          id,
          code: id,
          title: courses.get(id)?.title ?? null,
          label: id,
          note: "From your saved plan",
          units: courses.get(id)?.units ?? null,
          closesGap: false,
        };
  }
  return items;
}

/** met / not met by that term, can't be checked automatically, or not checked (co-op term). */
export type RuleStatus = "met" | "not_met" | "cannot_check" | "not_checked";
export type CourseRule = { text: string; status: RuleStatus };
/** Prerequisite and corequisite for a row's tooltips; null when the course has none. */
export type CourseRules = {
  prereq: CourseRule | null;
  coreq: CourseRule | null;
};

export type BoardCheck = {
  /** Item id -> plain-language reasons it breaks a rule where it sits. Absent: no problem. */
  flags: Record<string, string[]>;
  /** Term id -> problems with the term as a whole (e.g. too many units). */
  termProblems: Record<string, string[]>;
  /** Term id -> neutral notes that aren't rule breaks (e.g. a part-time load). */
  termNotes: Record<string, string[]>;
  /** Item id -> its prerequisite and corequisite, for course rows with course data. */
  rules: Record<string, CourseRules>;
};

export const COOP_FLAG =
  "This is a co-op work term. Move this course to a study term.";

const SEASON: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** The validator's message without its leading "BUS 410: prerequisite not met." */
const detail = (v: Violation, lead: string) =>
  v.message.slice(v.message.indexOf(lead) + lead.length).trim();

/** A course-level violation in plain words, or null when it isn't a rule break. */
function courseFlag(v: Violation): string | null {
  switch (v.code) {
    case "PREREQ_UNMET": {
      const rest = detail(v, "prerequisite not met.");
      return `Prerequisite not met by this term${rest ? `: ${rest}` : "."}`;
    }
    case "COREQ_UNMET": {
      const rest = detail(v, "corequisite not met.");
      return `Corequisite not met: take it in the same term or earlier${rest ? `. ${rest}` : "."}`;
    }
    case "NOT_OFFERED_RECENTLY":
      return `Not offered in recent ${SEASON[v.termId.split("-")[1]!]} terms. Check the schedule before counting on it.`;
    case "ALREADY_TAKEN":
    case "DUPLICATE_IN_PLAN":
      return v.message;
    case "ENTRY_GPA":
      return v.severity === "error" ? detail(v, ":") : null;
    default:
      return null;
  }
}

/**
 * Validates a board with the plan validator: named courses as the plan, electives as
 * placeholders (they count toward units and co-op terms). Nothing is rejected; every
 * break is reported against the row or card it belongs to.
 */
export function checkBoard(
  profile: StudentProfile,
  terms: BoardTerm[],
  items: Record<string, BoardItem>,
  catalog: PlanCatalog,
): BoardCheck {
  const electiveUnits = catalog.policy.unknown_course.units;
  const codeOf = (id: string) => items[id]?.code ?? null;
  const placeholders: Record<string, number[]> = {};
  const plan = {
    terms: terms.map((t) => {
      placeholders[t.termId] = t.itemIds
        .filter((id) => codeOf(id) === null)
        .map((id) => items[id]?.units ?? electiveUnits);
      return {
        id: t.termId,
        kind: t.kind,
        courses: t.itemIds.flatMap((id) => codeOf(id) ?? []),
      };
    }),
  };
  const validation = validatePlan(
    toEngineStudent(profile),
    plan,
    catalog,
    {},
    { graduation: false, placeholders },
  );

  const check: BoardCheck = {
    flags: {},
    termProblems: {},
    termNotes: {},
    rules: {},
  };
  const push = (map: Record<string, string[]>, key: string, text: string) => {
    const list = (map[key] ??= []);
    if (!list.includes(text)) list.push(text);
  };
  const termOf = new Map(terms.map((t) => [t.termId, t]));
  const idFor = (code: string, termId: string) =>
    termOf.get(termId)?.itemIds.find((id) => codeOf(id) === code);

  for (const v of validation.violations) {
    if (v.code === "COURSES_IN_COOP_TERM") {
      for (const id of termOf.get(v.termId)?.itemIds ?? [])
        push(check.flags, id, COOP_FLAG);
    } else if (v.code === "UNIT_LOAD_HIGH") {
      push(
        check.termProblems,
        v.termId,
        v.message.replace(/ \(ASSUMPTION.*$/, "."),
      );
    } else if (v.code === "UNIT_LOAD_LOW") {
      push(
        check.termNotes,
        v.termId,
        v.message.replace(/ \(ASSUMPTION.*$/, " for full-time study."),
      );
    } else if (v.code === "PLAN_TERM_ORDER") {
      push(check.termProblems, v.termId, "This term is out of order.");
    } else if (v.courseCode) {
      const text = courseFlag(v);
      const id = idFor(v.courseCode, v.termId);
      if (text && id) push(check.flags, id, text);
    }
  }

  const courseData = new Map(catalog.courses.map((c) => [c.code, c]));
  const prereqs = new Map(catalog.prereqs.map((r) => [r.code, r]));
  for (const term of terms) {
    for (const id of term.itemIds) {
      const code = codeOf(id);
      const course = code ? courseData.get(code) : undefined;
      if (!code || !course) continue;
      const record = prereqs.get(code);
      const here = validation.violations.filter(
        (v) => v.courseCode === code && v.termId === term.termId,
      );
      const status = (unmet: string, unknown: string[]): RuleStatus =>
        term.kind === "coop"
          ? "not_checked"
          : here.some((v) => v.code === unmet)
            ? "not_met"
            : here.some((v) => unknown.includes(v.code))
              ? "cannot_check"
              : "met";
      const prereqText = course.prerequisites_text?.trim() || record?.raw || "";
      const coreqText =
        course.corequisites_text?.trim() || record?.raw_coreq || "";
      check.rules[id] = {
        prereq:
          record?.prereq || prereqText
            ? {
                text: prereqText,
                status: record?.prereq
                  ? status("PREREQ_UNMET", [
                      "PREREQ_UNKNOWN",
                      "PREREQ_NEEDS_PERMISSION",
                    ])
                  : term.kind === "coop"
                    ? "not_checked"
                    : "cannot_check",
              }
            : null,
        coreq: record?.coreq
          ? {
              text: coreqText,
              status: status("COREQ_UNMET", ["COREQ_UNKNOWN"]),
            }
          : null,
      };
    }
  }
  return check;
}

/** Problems on one card: flagged rows plus problems with the term itself. */
export function problemCount(term: BoardTerm, check: BoardCheck): number {
  return (
    term.itemIds.filter((id) => (check.flags[id]?.length ?? 0) > 0).length +
    (check.termProblems[term.termId]?.length ?? 0)
  );
}
