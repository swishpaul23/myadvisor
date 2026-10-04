import { describe, expect, test } from "vitest";
import { MOCK_SURVEY_QUESTIONS, SKIP } from "@/lib/app/mocks";
import {
  draftToProfile,
  firstOpenStep,
  nextQuestionIndex,
  parseAnswer,
  parseStep,
} from "@/lib/app/onboarding";
import type { OnboardingDraft, RecordCourse } from "@/lib/app/types";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const course: RecordCourse = {
  code: "BUS 201",
  term: "2024-fall",
  status: "completed",
  grade: "B",
  institution: "SFU",
  units: null,
};
const answers = Object.fromEntries(
  MOCK_SURVEY_QUESTIONS.map((q) => [q.id, SKIP]),
);
const full: OnboardingDraft = {
  step: 4,
  admissionTerm: "2024-fall",
  concentrations: ["Finance"],
  planTerm: "2027-spring",
  courseLoad: 4,
  courses: [course],
  surveyAnswers: answers,
};

describe("parseStep", () => {
  test("program: term and one or two concentrations", () => {
    expect(
      parseStep(
        "program",
        form([
          ["admissionTerm", "2024-fall"],
          ["concentrations", "Finance"],
          ["concentrations", "Marketing"],
        ]),
      ),
    ).toEqual({
      ok: true,
      data: {
        admissionTerm: "2024-fall",
        concentrations: ["Finance", "Marketing"],
      },
    });
  });

  test("program: missing answers give field errors in plain language", () => {
    const r = parseStep("program", form([]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      admissionTerm: "Pick a term.",
      concentrations: "Pick at least one concentration.",
    });
  });

  test("program: an unknown concentration is refused", () => {
    const r = parseStep(
      "program",
      form([
        ["admissionTerm", "2024-fall"],
        ["concentrations", "Basket Weaving"],
      ]),
    );
    expect(r.ok).toBe(false);
  });

  test("next-term: load must be 2 to 6 courses", () => {
    expect(
      parseStep(
        "next-term",
        form([
          ["planTerm", "2027-spring"],
          ["courseLoad", "4"],
        ]),
      ).ok,
    ).toBe(true);
    const r = parseStep(
      "next-term",
      form([
        ["planTerm", "2027-spring"],
        ["courseLoad", "9"],
      ]),
    );
    expect(r.ok === false && r.fieldErrors?.courseLoad).toBe(
      "Pick a course load.",
    );
  });

  test("courses: normalises codes and resets confirmation", () => {
    const r = parseStep(
      "courses",
      form([["courses", JSON.stringify([{ ...course, code: " bus217w " }])]]),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        courses: [{ ...course, code: "BUS 217W" }],
        origin: "manual",
        recordConfirmed: false,
      },
    });
  });

  test("courses: per-row errors keyed by row and field", () => {
    const r = parseStep(
      "courses",
      form([
        [
          "courses",
          JSON.stringify([
            course,
            { ...course, code: "Intro to stuff" },
            { ...course, grade: null },
            { ...course, status: "in_progress" },
          ]),
        ],
      ]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toMatchObject({
      "courses.1.code": 'Use a course code like "BUS 217W".',
      "courses.2.grade": "Add the grade for a completed course.",
      "courses.3.grade": "A course in progress has no grade yet.",
    });
  });

  test("courses: empty list and unreadable payload", () => {
    const empty = parseStep("courses", form([["courses", "[]"]]));
    expect(empty.ok === false && empty.fieldErrors?.courses).toBe(
      "Add at least one course, or upload a transcript.",
    );
    expect(parseStep("courses", form([["courses", "{not json"]])).ok).toBe(
      false,
    );
  });
});

describe("parseAnswer", () => {
  const q = MOCK_SURVEY_QUESTIONS[0];
  test("one of the 4 options, or Skip", () => {
    expect(
      parseAnswer(
        form([
          ["questionId", q.id],
          ["answer", q.options[2].id],
        ]),
      ).ok,
    ).toBe(true);
    expect(
      parseAnswer(
        form([
          ["questionId", q.id],
          ["answer", SKIP],
        ]),
      ).ok,
    ).toBe(true);
  });
  test("no answer, a made-up answer or an unknown question is refused", () => {
    expect(parseAnswer(form([["questionId", q.id]])).ok).toBe(false);
    expect(
      parseAnswer(
        form([
          ["questionId", q.id],
          ["answer", "other"],
        ]),
      ).ok,
    ).toBe(false);
    expect(
      parseAnswer(
        form([
          ["questionId", "nope"],
          ["answer", SKIP],
        ]),
      ).ok,
    ).toBe(false);
  });
});

describe("saved progress", () => {
  test("resumes at the first unfinished step", () => {
    expect(firstOpenStep(null)).toBe("program");
    expect(
      firstOpenStep({
        step: 1,
        admissionTerm: "2024-fall",
        concentrations: ["Finance"],
      }),
    ).toBe("next-term");
    expect(firstOpenStep({ ...full, surveyAnswers: {} })).toBe("questions");
    expect(firstOpenStep(full)).toBe("review");
  });
  test("resumes at the first unanswered question", () => {
    const first = MOCK_SURVEY_QUESTIONS[0].id;
    expect(
      nextQuestionIndex({ step: 3, surveyAnswers: { [first]: SKIP } }),
    ).toBe(1);
    expect(nextQuestionIndex(full)).toBe(MOCK_SURVEY_QUESTIONS.length);
  });
});

describe("draftToProfile", () => {
  test("a finished draft becomes a confirmed BBA profile", () => {
    const r = draftToProfile(full);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      program: "BBA",
      recordConfirmed: true,
      courses: [course],
    });
    expect(r.data).not.toHaveProperty("step");
  });
  test("an unfinished draft names the step to finish", () => {
    expect(draftToProfile({ step: 0 })).toEqual({
      ok: false,
      error: 'Finish "Your program" first.',
    });
  });
});
