import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { Course } from "@/lib/data/catalog";
import {
  buildCalendarChunks,
  extractCourseCodes,
  extractKeywords,
  searchChunks,
} from "@/lib/data/calendar-search";
import type { RequirementRow } from "@/lib/data/schema";

const courses = JSON.parse(
  readFileSync("data/generated/courses.json", "utf8"),
) as Course[];
const requirements = (
  JSON.parse(readFileSync("data/generated/requirements.json", "utf8")) as {
    requirements: RequirementRow[];
  }
).requirements;
const chunks = buildCalendarChunks(courses, requirements);

describe("extractCourseCodes", () => {
  test("finds and normalises codes, without repeats", () => {
    expect(
      extractCourseCodes("Do I need bus 393 or BUS360W? And BUS 393 again"),
    ).toEqual(["BUS 393", "BUS 360W"]);
  });
  test("ignores stopwords before a number", () => {
    expect(
      extractCourseCodes("Can I take 300 level courses with 120 units?"),
    ).toEqual([]);
  });
});

describe("extractKeywords", () => {
  test("longest three non-stopwords, codes removed", () => {
    expect(
      extractKeywords(
        "What courses count for the Finance concentration electives?",
      ),
    ).toEqual(["concentration", "electives", "finance"]);
  });
});

describe("buildCalendarChunks (mirrors build-search.mjs)", () => {
  test("one chunk per course and per requirement row", () => {
    expect(chunks).toHaveLength(courses.length + requirements.length);
  });
  test("course chunk text and citation URL", () => {
    const c = chunks.find((x) => x.course_code === "BUS 410")!;
    expect(c.text).toMatch(
      /^BUS 410 .+ \(3\.0 units\)\. .* Prerequisites: BUS 315 and BUS 360W/,
    );
    expect(c.source_url).toBe(
      "https://www.sfu.ca/students/calendar/2026/fall/courses/bus/410.html",
    );
  });
});

describe("searchChunks", () => {
  test("exact course_code match first, then chunks that mention the code", () => {
    const hits = searchChunks(chunks, "Do I still need BUS 393?");
    expect(hits[0]!.course_code).toBe("BUS 393");
    expect(hits.length).toBeLessThanOrEqual(5);
    for (const h of hits.slice(1)) expect(h.text).toMatch(/BUS 393/i);
  });
  test("no code: keyword fallback, most keywords matched first", () => {
    const hits = searchChunks(chunks, "finance concentration electives");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.text).toMatch(/Finance/);
  });
  test("a code with no chunk falls back to keywords", () => {
    const hits = searchChunks(chunks, "ZZZ 999 investments");
    expect(hits.map((h) => h.course_code)).toContain("BUS 315");
  });
  test("nothing searchable -> no hits", () => {
    expect(searchChunks(chunks, "what should I do?")).toEqual([]);
  });
});
