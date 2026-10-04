import { readFileSync } from "node:fs";
import type { Course } from "@/lib/data/catalog";
import type { RequirementRow } from "@/lib/data/schema";
import type {
  Catalog,
  Policy,
  Student,
  StudentCourse,
} from "@/engine/audit/types";

// Test helpers: load the real generated catalog (tests may read files; the engine may not),
// and build small inline rows, courses and students.

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export function realCatalog(): Catalog {
  return {
    requirements: (
      json("data/generated/requirements.json") as {
        requirements: RequirementRow[];
      }
    ).requirements,
    courses: json("data/generated/courses.json") as Course[],
    unknownCourses: json(
      "data/generated/unknown-courses.json",
    ) as Catalog["unknownCourses"],
    policy: json("data/policy/sfu.json") as Policy,
  };
}

export const policy = (): Policy => realCatalog().policy;

export function row(
  partial: Partial<RequirementRow> & Pick<RequirementRow, "req_id">,
): RequirementRow {
  return {
    program: "BBA",
    concentration: null,
    catalog_term: "2026-fall",
    group: "Upper core",
    rule: "one course",
    n_or_units: 1,
    courses: [],
    level_min: null,
    level_max: null,
    designation: [],
    filter: [],
    min_grade: null,
    notes: "",
    source_url: "https://example.sfu.ca/test",
    status: "beta",
    verified_by: "",
    ...partial,
  } as RequirementRow;
}

export function course(
  code: string,
  units: number,
  designations: Course["designations"] = [],
): Course {
  return {
    code,
    title: code,
    units,
    level: Math.floor(Number(code.split(" ")[1]!.slice(0, 3)) / 100) * 100,
    department: code.split(" ")[0]!,
    prerequisites_text: null,
    corequisites_text: null,
    description: null,
    designations,
    designation_raw: designations.length ? designations.join("/") : "N/A",
    source_term: "2026-fall",
  };
}

export function catalog(
  requirements: RequirementRow[],
  courses: Course[],
): Catalog {
  return { requirements, courses, unknownCourses: [], policy: policy() };
}

export const took = (
  code: string,
  grade: string | null,
  extra: Partial<StudentCourse> = {},
): StudentCourse => ({
  code,
  grade,
  term: "2025-fall",
  institution: "SFU",
  status: grade === null ? "in_progress" : "completed",
  ...extra,
});

export function student(
  courses: StudentCourse[],
  extra: Partial<Student> = {},
): Student {
  return {
    admissionTerm: "2024-fall",
    declaredConcentrations: [],
    courses,
    ...extra,
  };
}
