import { describe, expect, test } from "vitest";
import {
  courseOfferingsSchema,
  coursesFileSchema,
  offeringsFileSchema,
  unknownCoursesFileSchema,
} from "@/lib/data/catalog";
import {
  buildCourse,
  buildOfferings,
  courseLevel,
  findUnknownCourses,
  type ManifestCourse,
} from "../../scripts/lib/catalog";
import { expandDesignation } from "../../scripts/lib/designations";
import { courseReferencesFromRequirementsCsv } from "../../scripts/lib/outlines/requirements";

describe("expandDesignation", () => {
  // Every string seen in the 2026-10-03 fetch (docs/outlines-api.md).
  test.each([
    ["N/A", []],
    ["", []],
    ["Writing", ["W"]],
    ["Quantitative", ["Q"]],
    ["Breadth-Social Sciences", ["B-Soc"]],
    ["Breadth-Humanities", ["B-Hum"]],
    ["Breadth-Science", ["B-Sci"]],
    ["Writing/Quantitative", ["W", "Q"]],
    ["Writing/Breadth-Humanities", ["W", "B-Hum"]],
    ["Writing/Breadth-Social Sci", ["W", "B-Soc"]],
    ["Quantitative/Breadth-Soc", ["Q", "B-Soc"]],
    ["Quantitative/Breadth-Science", ["Q", "B-Sci"]],
    ["Breadth-Humanities/Social Sciences", ["B-Soc", "B-Hum"]],
    ["Breadth-Social Sci/Science", ["B-Soc", "B-Sci"]],
    ["Breadth-Hum/Social Sci/Science", ["B-Soc", "B-Hum", "B-Sci"]],
  ])("%j -> %j", (raw, codes) => {
    expect(expandDesignation(raw)).toEqual({ ok: true, codes });
  });

  test.each([
    ["Breadth-Arts", ["Breadth-Arts"]],
    ["Writing/Science", ["Science"]], // "Science" alone is only valid after a breadth
    ["writing", ["writing"]],
    ["Quantitative/Other", ["Other"]],
  ])("fails on %j and names the unresolved part", (raw, unresolved) => {
    expect(expandDesignation(raw)).toEqual({ ok: false, unresolved });
  });
});

describe("buildCourse", () => {
  const info = {
    dept: "BUS",
    number: "360w",
    title: "Business Communication",
    units: "4",
    prerequisites: "BUS 217W with a minimum grade of C-.",
    corequisites: "",
    description: "Writing for business.",
    designation: "Writing",
  };

  test("builds a typed record; prerequisite text stays raw", () => {
    expect(buildCourse("BUS 360W", info, "2026/fall")).toEqual({
      errors: [],
      course: {
        code: "BUS 360W",
        title: "Business Communication",
        units: 4,
        level: 300,
        department: "BUS",
        prerequisites_text: "BUS 217W with a minimum grade of C-.",
        corequisites_text: "",
        requirements_text: null,
        short_note: null,
        description: "Writing for business.",
        designations: ["W"],
        designation_raw: "Writing",
        source_term: "2026-fall",
      },
    });
  });

  test("missing units -> null (BUS 296 has no units field)", () => {
    const { units, ...rest } = info;
    void units;
    expect(
      buildCourse("BUS 296", rest, "2025/spring").course?.units,
    ).toBeNull();
  });

  test("non-numeric units and unknown designations fail the build", () => {
    expect(
      buildCourse("BUS 360W", { ...info, units: "3-6" }, "2026/fall").errors,
    ).toEqual(['BUS 360W: units "3-6" is not a number']);
    const result = buildCourse(
      "BUS 360W",
      { ...info, designation: "Breadth-Arts" },
      "2026/fall",
    );
    expect(result.course).toBeNull();
    expect(result.errors[0]).toMatch(
      /designation "Breadth-Arts" has unknown parts: "Breadth-Arts"/,
    );
  });

  test("falls back to the course-list title when the outline has none", () => {
    const { title, ...rest } = info;
    void title;
    expect(
      buildCourse("ENGL 345", rest, "2025/spring", "Some Title").course?.title,
    ).toBe("Some Title");
  });

  test("level is the hundreds of the course number", () => {
    expect(courseLevel("BUS 217W")).toBe(200);
    expect(courseLevel("BUS 496")).toBe(400);
  });

  test("records pass the courses.json schema", () => {
    const course = buildCourse("BUS 360W", info, "2026/fall").course;
    expect(coursesFileSchema.safeParse([course]).success).toBe(true);
  });
});

describe("buildOfferings", () => {
  const courses: Record<string, ManifestCourse> = {
    "BUS 303": {
      title: "Business, Society and Ethics",
      ran: ["2025/fall", "2026/spring"],
      sections: {
        "2026/spring": ["LEC", "TUT"],
        "2025/fall": ["LEC"],
        "2027/spring": ["LEC"],
      },
      outline: "2026/spring/bus/303.outline.json",
    },
    "BUS 450": {
      title: "Innovation Consulting",
      ran: [],
      sections: { "2027/spring": ["SEM"] },
      outline: "2027/spring/bus/450.outline.json",
    },
    "BUS 999": {
      title: null,
      ran: [],
      sections: { "2026/fall": [] },
      outline: null,
    },
  };
  const offerings = buildOfferings(courses, new Set(["2027/spring"]));

  test("confirmed terms as keys, future terms apart, any section type counts", () => {
    expect(offerings["BUS 303"]).toEqual({
      "2025-fall": ["LEC"],
      "2026-spring": ["LEC", "TUT"],
      future: { "2027-spring": ["LEC"] },
    });
    expect(offerings["BUS 450"]).toEqual({
      future: { "2027-spring": ["SEM"] },
    });
  });

  test("a term needs at least one section; courses with none are left out", () => {
    expect(offerings["BUS 999"]).toBeUndefined();
  });

  test("passes the offerings.json schema; rejects a bad term key", () => {
    expect(offeringsFileSchema.safeParse(offerings).success).toBe(true);
    expect(
      courseOfferingsSchema.safeParse({ "Fall 2026": ["LEC"], future: {} })
        .success,
    ).toBe(false);
  });
});

describe("findUnknownCourses", () => {
  const csv = [
    "req_id,program,concentration,catalog_term,group,rule,n_or_units,courses,level_min,level_max,designation,filter,min_grade,notes,source_url,status,verified_by",
    'r1,BBA,,2026-fall,Lower core,one course,1,"BUS 201, PSYC 106",,,,,C-,,https://x,beta,',
    'r2,BBA,,2026-fall,Beedie,units from,6,"PSYC 106, CA 381",,,,,,,https://x,beta,',
    'r3,BBA,,2026-fall,Upper core,n courses,1,"CMPT 120",,,,,,,https://x,out-of-scope,',
  ].join("\n");
  const refs = courseReferencesFromRequirementsCsv(csv);

  test("collects req_ids per course and skips out-of-scope rows", () => {
    expect(refs).toEqual({
      "BUS 201": ["r1"],
      "CA 381": ["r2"],
      "PSYC 106": ["r1", "r2"],
    });
  });

  test("reports courses with no data as offering unknown", () => {
    const result = findUnknownCourses(
      refs,
      new Set(["BUS 201"]),
      ["CA 381", "PSYC 106"],
      "2025-spring to 2027-spring",
    );
    expect(result.errors).toEqual([]);
    expect(result.unknown).toEqual([
      {
        code: "CA 381",
        req_ids: ["r2"],
        reason:
          "offering unknown: no outline found in 2025-spring to 2027-spring",
      },
      {
        code: "PSYC 106",
        req_ids: ["r1", "r2"],
        reason:
          "offering unknown: no outline found in 2025-spring to 2027-spring",
      },
    ]);
    expect(unknownCoursesFileSchema.safeParse(result.unknown).success).toBe(
      true,
    );
  });

  test("fails when a course is in neither courses.json nor the manifest's no-data list", () => {
    const result = findUnknownCourses(
      refs,
      new Set(["BUS 201"]),
      ["CA 381"],
      "x",
    );
    expect(result.unknown.map((u) => u.code)).toEqual(["CA 381"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(
      /^PSYC 106 \(named by r1, r2\) is neither in courses.json/,
    );
  });
});
