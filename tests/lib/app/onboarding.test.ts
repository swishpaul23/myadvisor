import { describe, expect, test } from "vitest";
import { MOCK_SURVEY_QUESTIONS, SKIP } from "@/lib/app/mocks";
import {
  draftToProfile,
  firstOpenStep,
  nextQuestionIndex,
  parseAnswer,
  parseStep,
} from "@/lib/app/onboarding";
import { admissionYearOptions } from "@/lib/app/terms";
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
  test("program: admission season and year, one or two concentrations", () => {
    expect(
      parseStep(
        "program",
        form([
          ["admissionSeason", "fall"],
          ["admissionYear", "2023"],
          ["concentrations", "Finance"],
          ["concentrations", "Marketing"],
        ]),
      ),
    ).toEqual({
      ok: true,
      data: {
        admissionTerm: "2023-fall",
        concentrations: ["Finance", "Marketing"],
      },
    });
  });

  test("program: missing answers give field errors in plain language", () => {
    const r = parseStep("program", form([]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      admissionSeason: "Pick the season you were admitted.",
      admissionYear: "Pick the year you were admitted.",
      concentrations: "Pick at least one concentration.",
    });
  });

  test("program: a made-up season is refused", () => {
    const r = parseStep(
      "program",
      form([
        ["admissionSeason", "winter"],
        ["admissionYear", "2023"],
        ["concentrations", "Finance"],
      ]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      admissionSeason: "Pick the season you were admitted.",
    });
  });

  test("program: an unknown concentration is refused", () => {
    const r = parseStep(
      "program",
      form([
        ["admissionSeason", "fall"],
        ["admissionYear", "2024"],
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

  test("next-term: co-op with work terms (sorted, consecutive allowed)", () => {
    const r = parseStep(
      "next-term",
      form([
        ["planTerm", "2027-spring"],
        ["courseLoad", "4"],
        ["coop", "yes"],
        ["coopTerms", "2028-spring"],
        ["coopTerms", "2027-fall"],
      ]),
    );
    expect(r).toEqual({
      ok: true,
      data: {
        planTerm: "2027-spring",
        courseLoad: 4,
        coop: { doing: true, workTerms: ["2027-fall", "2028-spring"] },
      },
    });
  });

  test("next-term: no co-op answer, or 'no', means no co-op and no work terms", () => {
    for (const extra of [
      [],
      [
        ["coop", "no"],
        ["coopTerms", "2027-fall"],
      ],
    ]) {
      const r = parseStep(
        "next-term",
        form([
          ["planTerm", "2027-spring"],
          ["courseLoad", "4"],
          ...(extra as [string, string][]),
        ]),
      );
      expect(r.ok && r.data.coop).toEqual({ doing: false, workTerms: [] });
    }
  });

  test("next-term: at most 3 work terms, none before the start term", () => {
    const many = parseStep(
      "next-term",
      form([
        ["planTerm", "2027-spring"],
        ["courseLoad", "4"],
        ["coop", "yes"],
        ["coopTerms", "2027-summer"],
        ["coopTerms", "2027-fall"],
        ["coopTerms", "2028-spring"],
        ["coopTerms", "2028-summer"],
      ]),
    );
    expect(many.ok === false && many.fieldErrors?.coopTerms).toBe(
      "Pick up to 3 work terms.",
    );
    const early = parseStep(
      "next-term",
      form([
        ["planTerm", "2027-spring"],
        ["courseLoad", "4"],
        ["coop", "yes"],
        ["coopTerms", "2026-fall"],
      ]),
    );
    expect(early.ok === false && early.fieldErrors?.coopTerms).toBe(
      "Work terms start from your plan's start term.",
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

describe("admission year options", () => {
  test("this year back twelve years, newest first (2023 included)", () => {
    const years = admissionYearOptions(new Date(2026, 9, 4));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2014);
    expect(years).toContain(2023);
  });
});
