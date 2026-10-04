import { describe, expect, test } from "vitest";
import { toEngineStudent } from "@/lib/app/engine-input";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import { profileSchema } from "@/lib/app/types";
import { demoStudent } from "../../engine/fixtures/demo-student";

describe("toEngineStudent (profile -> rules engine input)", () => {
  test("the sample student is exactly the engine's hand-checked demo student", () => {
    expect(toEngineStudent(SAMPLE_PROFILE)).toEqual(demoStudent);
  });

  test("the sample profile passes the same validation as a real one", () => {
    expect(profileSchema.safeParse(SAMPLE_PROFILE).success).toBe(true);
  });

  test("survey answers, plan term and course load never reach the engine", () => {
    const student = toEngineStudent({
      ...SAMPLE_PROFILE,
      surveyAnswers: { "finish-by": "asap" },
      courseLoad: 6,
    });
    expect(Object.keys(student).sort()).toEqual([
      "admissionTerm",
      "courses",
      "declaredConcentrations",
      "program",
    ]);
  });

  test("units are passed only when the student gave them", () => {
    const student = toEngineStudent({
      ...SAMPLE_PROFILE,
      courses: [
        {
          code: "CMPT 1XX",
          term: "2024-fall",
          status: "completed",
          grade: "CR",
          institution: "transfer",
          units: 3,
        },
        {
          code: "BUS 201",
          term: "2024-fall",
          status: "completed",
          grade: "B",
          institution: "SFU",
          units: null,
        },
      ],
    });
    expect(student.courses[0]).toHaveProperty("units", 3);
    expect(student.courses[1]).not.toHaveProperty("units");
  });
});
