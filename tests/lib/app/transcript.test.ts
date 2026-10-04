import { describe, expect, test } from "vitest";
import {
  isExtraction,
  normalizeExtraction,
  type ExtractedCourse,
  type Extraction,
} from "@/lib/app/transcript";

const row = (over: Partial<ExtractedCourse> = {}): ExtractedCourse => ({
  code: "BUS 201",
  title: "Intro to Business",
  units: 3,
  grade: "B",
  term: "2024-fall",
  status: "completed",
  institution: "SFU",
  ...over,
});
const extraction = (courses: ExtractedCourse[]): Extraction => ({
  courses,
  cgpa: 3.12,
  standing: "Good academic standing",
});
const known = new Set(["BUS 201", "BUS 217W", "MATH 157"]);

describe("isExtraction (guard for Gemini's output)", () => {
  test("accepts the expected shape", () => {
    expect(isExtraction(extraction([row()]))).toBe(true);
    expect(isExtraction({ courses: [], cgpa: null, standing: null })).toBe(
      true,
    );
  });
  test("rejects anything else", () => {
    expect(isExtraction(null)).toBe(false);
    expect(isExtraction({ courses: "BUS 201" })).toBe(false);
    expect(
      isExtraction(extraction([{ ...row(), status: "done" } as never])),
    ).toBe(false);
    expect(isExtraction(extraction([{ ...row(), units: "3" } as never]))).toBe(
      false,
    );
    expect(isExtraction({ ...extraction([]), cgpa: Number.NaN })).toBe(false);
  });
});

describe("normalizeExtraction", () => {
  test("clean rows pass through, codes normalised, repeats kept", () => {
    const r = normalizeExtraction(
      extraction([
        row({ code: "bus217w", grade: "a-" }),
        row({ code: "MATH 157", grade: "D" }),
        row({ code: "MATH 157", grade: "B", term: "2025-spring" }),
      ]),
      known,
    );
    expect(r.flags).toEqual({});
    expect(r.courses.map((c) => [c.code, c.grade])).toEqual([
      ["BUS 217W", "A-"],
      ["MATH 157", "D"],
      ["MATH 157", "B"],
    ]);
    expect(r).toMatchObject({ cgpa: 3.12, standing: "Good academic standing" });
  });

  test("in-progress courses have no grade", () => {
    const r = normalizeExtraction(
      extraction([
        row({ status: "in_progress", grade: "B", term: "2026-fall" }),
      ]),
      known,
    );
    expect(r.courses[0]).toMatchObject({ status: "in_progress", grade: null });
    expect(r.flags).toEqual({});
  });

  test("transfer credit without a letter grade becomes CR", () => {
    const r = normalizeExtraction(
      extraction([
        row({ code: "ECON 105", institution: "transfer", grade: "TR" }),
        row({
          code: "CMPT 1XX",
          institution: "transfer",
          grade: null,
          units: 3,
        }),
      ]),
      known,
    );
    expect(r.courses.map((c) => c.grade)).toEqual(["CR", "CR"]);
  });

  test("rows to double-check are flagged, never dropped", () => {
    const r = normalizeExtraction(
      extraction([
        row({ code: "CMPT 120" }), // real SFU course, not in MyAdvisor's data
        row({ term: "Fall term" }),
        row({ grade: null }),
        row({ grade: "AU" }),
        row({ code: "Business Lab" }),
      ]),
      known,
    );
    expect(r.courses).toHaveLength(5);
    expect(r.flags[0]).toMatch(/not in MyAdvisor's course data/i);
    expect(r.flags[1]).toMatch(/pick the term/i);
    expect(r.courses[1]!.term).toBe("");
    expect(r.flags[2]).toMatch(/add the grade/i);
    expect(r.flags[3]).toMatch(/grade "AU" isn't one we recognise/i);
    expect(r.flags[4]).toMatch(/check the course code/i);
  });

  test("implausible units are dropped (the course data's units are used instead)", () => {
    const r = normalizeExtraction(extraction([row({ units: 300 })]), known);
    expect(r.courses[0]!.units).toBeNull();
  });
});
