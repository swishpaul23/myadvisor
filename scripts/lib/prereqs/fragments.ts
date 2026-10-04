import type { PrereqNode } from "@/lib/data/prereqs";

// Typed nodes for a few exact fragment patterns (Stuart, 2026-10-04). A fragment that
// matches none of these, in full, stays an `unknown` node. Do not add patterns by guessing.

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

/** Subject words seen in count phrases, mapped to course-code subjects. */
const SUBJECT_WORDS: Record<string, string> = { English: "ENGL" };

/** "two 200-division English courses", "one 100-division English course". */
const COUNT =
  /^(one|two|three|four|five|six) ([1-4])00-division (English) courses?$/i;

/** "permission of the instructor", "permission of instructor", "permission from the
 * instructor", "permission of the department", "permission of the co-op co-ordinator". */
const PERMISSION =
  /^permission (?:of|from) (?:the )?(instructor|department|co-op co-ordinator)$/i;
const WHO: Record<string, "instructor" | "department" | "co-op coordinator"> = {
  instructor: "instructor",
  department: "department",
  "co-op co-ordinator": "co-op coordinator",
};

/** Program or admission restrictions, only when they name no course and no GPA. */
const RESTRICTION_LEAD =
  /^(?:Reserved for|(?:This|The) course is only open to|Open only to|Enrolled in)\b/i;
const STUDENTS_ENROLLED = /\bstudents enrolled in\b/i;
const COURSE_CODE = /\b[A-Z]{2,5} \d{3}/;
const GPA = /\bC?GPA\b/;

/** "Pre-Calculus 12 (or equivalent) with a grade of at least B+", "Pre-Calculus 12 or
 * Foundations of Mathematics 12 (or equivalent) with a grade of at least B". */
const HIGH_SCHOOL =
  /^(?:Pre-Calculus|Foundations of Mathematics) 1[12](?: or (?:Pre-Calculus|Foundations of Mathematics) 1[12])?(?: \(or equivalent\))?(?: with a grade of at least ([A-D][+-]?))?$/;

/**
 * Student groups that start an alternative route, as written in requirements-course
 * prerequisites (data/generated/prereqs-review-requirements.json, 2026-10-04).
 */
const STUDENT_GROUP =
  /^\(?(?:business administration minor students admitted|business administration joint major, joint honours, or double degree students|data science (?:majors|students)|actuarial science students|(?:innovation and entrepreneurship|corporate environmental and social sustainability) certificate students|students admitted (?:prior to|Fall \d{4} onward))\b/i;

/** An alt_group node if `text` (the alternative, without its leading "or") starts with a
 * known student group; otherwise null. `group` is the text before the first " with ". */
export function matchAltGroup(raw: string): PrereqNode | null {
  const text = raw.trim();
  if (!STUDENT_GROUP.test(text)) return null;
  const group = text
    .replace(/^\(/, "")
    .split(/\s+with\s+/)[0]!
    .replace(/\)$/, "")
    .trim();
  return { type: "alt_group", group, text };
}

/** A typed node for an exact pattern, otherwise an unknown node. Text is kept verbatim. */
export function classifyFragment(raw: string): PrereqNode {
  const text = raw.trim();

  const count = COUNT.exec(text);
  if (count) {
    const subject =
      SUBJECT_WORDS[
        count[3]!.charAt(0).toUpperCase() + count[3]!.slice(1).toLowerCase()
      ];
    return {
      type: "count",
      n: NUMBER_WORDS[count[1]!.toLowerCase()]!,
      ...(subject ? { subject } : {}),
      level: Number(count[2]) * 100,
      text,
    };
  }

  const highSchool = HIGH_SCHOOL.exec(text);
  if (highSchool) {
    const grade = highSchool[1] as "A" | undefined;
    return {
      type: "external",
      kind: "high_school",
      ...(grade ? { minGrade: grade } : {}),
      text,
    };
  }

  const permission = PERMISSION.exec(text);
  if (permission) {
    return {
      type: "permission",
      who: WHO[permission[1]!.toLowerCase()]!,
      text,
    };
  }

  if (
    (RESTRICTION_LEAD.test(text) || STUDENTS_ENROLLED.test(text)) &&
    !COURSE_CODE.test(text) &&
    !GPA.test(text)
  ) {
    return { type: "restriction", text };
  }

  return { type: "unknown", text };
}
