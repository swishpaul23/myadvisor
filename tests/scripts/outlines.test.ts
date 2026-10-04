import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createClient,
  TooManyFailuresError,
  type FetchFn,
} from "../../scripts/lib/outlines/client";
import {
  courseCode,
  isUndergraduate,
  outlineSectionCandidates,
  parseCourses,
  parseDepartments,
  parseOutline,
  parseSections,
  parseTerms,
  parseYears,
  splitCourseCode,
} from "../../scripts/lib/outlines/parse";
import {
  coursesListPath,
  outlinePath,
  sectionsPath,
} from "../../scripts/lib/outlines/paths";
import { courseCodesFromRequirementsCsv } from "../../scripts/lib/outlines/requirements";
import { isPathAllowed } from "../../scripts/lib/outlines/robots";
import { stripOutline } from "../../scripts/lib/outlines/strip";
import {
  compareTerms,
  lastTerms,
  parseTerm,
  termKey,
} from "../../scripts/lib/outlines/terms";
import { apiUrl } from "../../scripts/lib/outlines/urls";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/outlines/${name}`, "utf8"));

const BASE = "https://www.sfu.ca/bin/wcm/course-outlines";

describe("apiUrl", () => {
  test("builds each level of the query-string path", () => {
    expect(apiUrl(BASE)).toBe(BASE);
    expect(apiUrl(BASE, { year: 2026 })).toBe(`${BASE}?2026`);
    expect(apiUrl(BASE, { year: 2026, term: "fall", dept: "BUS" })).toBe(
      `${BASE}?2026/fall/bus`,
    );
    expect(
      apiUrl(BASE, {
        year: 2026,
        term: "fall",
        dept: "bus",
        number: "360W",
        section: "D100",
      }),
    ).toBe(`${BASE}?2026/fall/bus/360w/d100`);
    expect(apiUrl(BASE, { year: "current" })).toBe(`${BASE}?current`);
  });

  test("rejects a path with a gap", () => {
    expect(() => apiUrl(BASE, { year: 2026, dept: "bus" })).toThrow(/gap/);
  });
});

describe("terms", () => {
  test("last six terms ending at 2026 fall, oldest first", () => {
    expect(lastTerms(parseTerm("2026/fall"), 6).map(termKey)).toEqual([
      "2025/spring",
      "2025/summer",
      "2025/fall",
      "2026/spring",
      "2026/summer",
      "2026/fall",
    ]);
  });

  test("crosses a year boundary", () => {
    expect(lastTerms(parseTerm("2026/spring"), 3).map(termKey)).toEqual([
      "2025/summer",
      "2025/fall",
      "2026/spring",
    ]);
  });

  test("orders terms and rejects bad keys", () => {
    expect(
      compareTerms(parseTerm("2027/spring"), parseTerm("2026/fall")),
    ).toBeGreaterThan(0);
    expect(
      compareTerms(parseTerm("2026/summer"), parseTerm("2026/fall")),
    ).toBeLessThan(0);
    expect(() => parseTerm("2026/winter")).toThrow();
  });
});

describe("paths", () => {
  const fall = parseTerm("2026/fall");
  test("lowercase dept and number under year/term/dept", () => {
    expect(coursesListPath(fall, "BUS")).toBe("2026/fall/bus/_courses.json");
    expect(sectionsPath(fall, "BUS", "217W")).toBe(
      "2026/fall/bus/217w.sections.json",
    );
    expect(outlinePath(fall, "bus", "312")).toBe(
      "2026/fall/bus/312.outline.json",
    );
  });
});

describe("response parsing", () => {
  test("parses every list level from real samples", () => {
    expect(parseYears(fixture("years.json"))).toContainEqual({
      text: "2026",
      value: "2026",
    });
    expect(parseTerms(fixture("terms-2026.json")).map((t) => t.value)).toEqual([
      "fall",
      "spring",
      "summer",
    ]);
    expect(parseDepartments(fixture("depts-2026-fall.json"))[0]).toMatchObject({
      value: "als",
    });
    expect(
      parseCourses(fixture("courses-2026-fall-bus.json")).map((c) => c.value),
    ).toContain("217w");
    expect(
      parseSections(fixture("sections-2026-fall-bus-312.json")),
    ).toHaveLength(3);
    expect(
      parseOutline(fixture("outline-2026-fall-phil-100w-d100.json")).info.dept,
    ).toBe("PHIL");
  });

  test("accepts course-list entries without a title (seen for ENGL 345, 2025 spring)", () => {
    expect(parseCourses([{ text: "345", value: "345" }])).toEqual([
      { text: "345", value: "345" },
    ]);
  });

  test("fails loudly on an unexpected shape", () => {
    expect(() =>
      parseCourses(fixture("notrun-2026-fall-bus-488.json")),
    ).toThrow(/courses/);
    expect(() => parseSections([{ text: "D100" }])).toThrow(/sections/);
  });

  test("keeps undergraduate course numbers only", () => {
    const numbers = parseCourses(fixture("courses-2026-fall-bus.json"))
      .map((c) => c.value)
      .filter((n) => isUndergraduate(n));
    expect(numbers).toEqual(["201", "217w", "312", "360w", "496"]);
  });

  test("converts course codes both ways", () => {
    expect(courseCode("bus", "217w")).toBe("BUS 217W");
    expect(splitCourseCode("BUS 217W")).toEqual({
      dept: "bus",
      number: "217w",
    });
    expect(() => splitCourseCode("BUS217")).toThrow();
  });

  test("tries enrolment lectures before tutorials", () => {
    const candidates = outlineSectionCandidates(
      parseSections(fixture("sections-2026-fall-phil-100w.json")),
    );
    expect(candidates.map((s) => s.value)).toEqual(["d100"]);
  });
});

describe("stripOutline", () => {
  const raw = parseOutline(fixture("outline-2026-fall-phil-100w-d100.json"));
  const { outline, unknownKeys } = stripOutline(raw);
  const saved = JSON.stringify(outline);

  test("no instructor names or contact details survive", () => {
    for (const secret of [
      "Quintessa",
      "Vandermolen",
      "Quinta",
      "qvandermolen",
      "778-555-0142",
      "WMC 9999",
      "Tuesdays 2-3pm",
      "philcomm@sfu.ca",
    ]) {
      expect(saved).not.toContain(secret);
    }
    expect(outline.info.notes).toContain("[name removed]");
    expect(outline.info.notes).toContain("[email removed]");
    expect(outline.info.notes).toContain("[phone removed]");
  });

  test("drops people, grading, textbooks, and schedules", () => {
    expect(Object.keys(outline)).toEqual(["info"]);
    for (const key of [
      "courseDetails",
      "educationalGoals",
      "gradingNotes",
      "materials",
      "requiredReadingNotes",
    ]) {
      expect(outline.info).not.toHaveProperty(key);
    }
  });

  test("keeps every course-level field unchanged", () => {
    const info = raw.info as Record<string, unknown>;
    for (const key of [
      "title",
      "units",
      "prerequisites",
      "corequisites",
      "designation",
      "description",
      "dept",
      "number",
      "degreeLevel",
      "deliveryMethod",
    ]) {
      expect(outline.info[key]).toBe(info[key]);
    }
    expect(outline.info.designation).toBe("Writing/Breadth-Humanities");
  });

  test("reports fields it does not know", () => {
    expect(unknownKeys).toEqual([]);
    const result = stripOutline({
      info: { dept: "BUS", newField: "x" },
      extra: 1,
    });
    expect(result.unknownKeys.sort()).toEqual(["extra", "info.newField"]);
    expect(result.outline.info).toEqual({ dept: "BUS" });
  });

  test("drops requirements, shortNote and recommendedText without reporting them", () => {
    const result = stripOutline({
      info: {
        dept: "BUS",
        requirements: "Attendance is mandatory. Ask Quintessa Vandermolen.",
        shortNote: "Books are available at SFU Bookstore.",
      },
      instructor: [{ firstName: "Quintessa", lastName: "Vandermolen" }],
      recommendedText: [{ details: "Some textbook" }],
    });
    expect(result.unknownKeys).toEqual([]);
    expect(result.outline).toEqual({ info: { dept: "BUS" } });
  });

  test("scrubs strings nested inside kept values", () => {
    const result = stripOutline({
      info: {
        notes: [
          "Call 778-555-0142",
          { who: "Quintessa Vandermolen at qv@example.sfu.ca" },
        ],
      },
      instructor: [{ firstName: "Quintessa", lastName: "Vandermolen" }],
    });
    expect(result.outline.info.notes).toEqual([
      "Call [phone removed]",
      { who: "[name removed] at [email removed]" },
    ]);
  });

  test("does not remove ordinary words that match a first name", () => {
    const result = stripOutline({
      info: { description: "Students will learn." },
      instructor: [{ firstName: "Will", lastName: "Smith" }],
    });
    expect(result.outline.info.description).toBe("Students will learn.");
  });
});

describe("courseCodesFromRequirementsCsv", () => {
  const csv = [
    "req_id,program,concentration,catalog_term,group,rule,n_or_units,courses,level_min,level_max,designation,filter,min_grade,notes,source_url,status,verified_by",
    'r1,BBA,,2026-fall,Lower core,one course,1,"BUS 201, BUS 202",,,,institution SFU,C-,,https://x,beta,',
    'r2,BBA,,2026-fall,Upper core,n courses,3,,,,,"dept BUS; exclude BUS 425|BUS 478",,,https://x,beta,',
    'r3,BBA,,2026-fall,Beedie,units from,6,"GEOG 100, IS 101",,,,,,,https://x,beta,',
    "r4,BBA,,2026-fall,Beedie,units from,9,,,,,from_reqs r3,,,https://x,beta,",
    'r5,BBA,,2026-fall,Upper core,minimum fraction,1,"CMPT 120",,,,,,,https://x,out-of-scope,',
  ].join("\n");

  test("collects courses and exclusions, skips out-of-scope and from_reqs rows", () => {
    expect(courseCodesFromRequirementsCsv(csv)).toEqual([
      "BUS 201",
      "BUS 202",
      "BUS 425",
      "BUS 478",
      "GEOG 100",
      "IS 101",
    ]);
  });
});

describe("isPathAllowed", () => {
  const robots = [
    "User-agent: Twitterbot",
    "Disallow: *",
    "",
    "User-agent: *",
    "Disallow: /phonebook",
    "Disallow: /content/dam",
    "Allow: /content/dam/math",
  ].join("\n");

  test("applies the * group to our user agent", () => {
    expect(
      isPathAllowed(
        robots,
        "myAdvisor-hackathon (contact: x)",
        "/bin/wcm/course-outlines",
      ),
    ).toBe(true);
    expect(isPathAllowed(robots, "myAdvisor-hackathon", "/phonebook/x")).toBe(
      false,
    );
    expect(
      isPathAllowed(robots, "myAdvisor-hackathon", "/content/dam/math/a"),
    ).toBe(true);
    expect(
      isPathAllowed(robots, "Twitterbot", "/bin/wcm/course-outlines"),
    ).toBe(false);
  });
});

describe("createClient", () => {
  const response = (status: number, body = "[]") => ({
    status,
    headers: { get: () => null },
    text: async () => body,
  });

  function fakeClient(statuses: number[], maxConsecutiveFailures = 10) {
    const calls: string[] = [];
    let clock = 0;
    const fetchFn: FetchFn = async (url) => {
      calls.push(url);
      return response(statuses.shift() ?? 200);
    };
    const client = createClient({
      userAgent: "test",
      intervalMs: 1000,
      fetchFn,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      maxConsecutiveFailures,
    });
    return { client, calls };
  }

  test("does not retry 404", async () => {
    const { client, calls } = fakeClient([404]);
    expect(await client.getJson("u")).toEqual({ status: "not-found" });
    expect(calls).toHaveLength(1);
  });

  test("retries 429 and 5xx up to 3 times", async () => {
    const { client, calls } = fakeClient([429, 503, 200]);
    expect((await client.getJson("u")).status).toBe("ok");
    expect(calls).toHaveLength(3);

    const failing = fakeClient([500, 500, 500, 500, 200]);
    expect((await failing.client.getJson("u")).status).toBe("failed");
    expect(failing.calls).toHaveLength(4);
  });

  test("aborts after too many consecutive failures", async () => {
    const { client } = fakeClient(Array(20).fill(500), 2);
    await client.getJson("a");
    await expect(client.getJson("b")).rejects.toBeInstanceOf(
      TooManyFailuresError,
    );
  });
});
