import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { audit } from "@/engine/audit";
import { suggestNextTerm } from "@/engine/plan/suggest";
import type { PlanCatalog } from "@/engine/plan/types";
import {
  advisorRequestSchema,
  buildAdvisorPrompt,
  citedSources,
  introMessage,
  stripUnknownCitations,
} from "@/lib/app/advisor";
import { toEngineStudent } from "@/lib/app/engine-input";
import {
  buildChecklist,
  buildGaps,
  presentPlan,
  unitsSummary,
} from "@/lib/app/present";
import { SAMPLE_PROFILE } from "@/lib/app/sample";
import type { CourseOfferings } from "@/lib/data/catalog";
import type { PrereqRecord } from "@/lib/data/prereqs";
import { realCatalog } from "../../engine/helpers";

const json = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const catalog: PlanCatalog = {
  ...realCatalog(),
  offerings: json("data/generated/offerings.json") as Record<
    string,
    CourseOfferings
  >,
  prereqs: json("data/generated/prereqs.json") as PrereqRecord[],
};
const student = toEngineStudent(SAMPLE_PROFILE);
const result = audit(student, catalog);
const plan = presentPlan(
  suggestNextTerm(student, catalog, { termId: "2027-spring", courseLoad: 4 }),
  catalog.requirements,
  result,
  SAMPLE_PROFILE,
  catalog.courses,
);
const facts = {
  profile: SAMPLE_PROFILE,
  units: unitsSummary(result),
  checklist: buildChecklist(catalog.requirements, result),
  gaps: buildGaps(catalog.requirements, result),
  plan,
};
const passage = {
  text: "BUS 393 Commercial Law (3.0 units). Prerequisites: 45 units.",
  course_code: "BUS 393",
  source_url:
    "https://www.sfu.ca/students/calendar/2026/fall/courses/bus/393.html",
};

describe("advisorRequestSchema", () => {
  test("trims, limits length and history", () => {
    expect(
      advisorRequestSchema.parse({ message: "  Do I need BUS 393? " }),
    ).toEqual({
      message: "Do I need BUS 393?",
      history: [],
    });
    expect(advisorRequestSchema.safeParse({ message: "   " }).success).toBe(
      false,
    );
    expect(
      advisorRequestSchema.safeParse({ message: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(
      advisorRequestSchema.safeParse({
        message: "hi",
        history: Array.from({ length: 11 }, () => ({
          role: "user",
          text: "x",
        })),
      }).success,
    ).toBe(false);
    expect(
      advisorRequestSchema.safeParse({
        message: "hi",
        history: [{ role: "system", text: "x" }],
      }).success,
    ).toBe(false);
  });
});

describe("buildAdvisorPrompt (grounding)", () => {
  const { prompt, sources } = buildAdvisorPrompt(facts, [passage], {
    message: "Do I still need BUS 393?",
    history: [{ role: "user", text: "Hi" }],
  });

  test("numbered sources: gap sources, then claim sources, then calendar passages", () => {
    expect(sources.map((s) => s.title)).toEqual([
      "SFU Calendar · BBA program requirements",
      "SFU Calendar · BUS 496", // upper-bus496 cites the BUS 496 course page (gaps come first)
      "SFU Calendar · BUS 373",
      "SFU Calendar · BUS 478",
      "SFU Calendar · BUS 393",
    ]);
    expect(prompt).toContain(
      "[1] SFU Calendar · BBA program requirements (https://",
    );
  });

  test("engine facts, with gaps and claims cited and claim labels kept", () => {
    expect(prompt).toContain(
      "- Finance concentration: GAP (BUS 313, BUS 315 missing)",
    );
    expect(prompt).toContain(
      "- BUS 313: Required for the Finance concentration. Not on your record yet. [1]",
    );
    expect(prompt).toContain(
      "- UNRESOLVED: Seats and timetable fit aren't checked yet.",
    );
    expect(prompt).toContain("- ASSUMPTION: 4 courses is the load you chose.");
    expect(prompt).toContain("(a fictional sample student)");
    expect(prompt).toContain("Prerequisites: 45 units. [5]");
  });

  test("history and the question come last", () => {
    expect(
      prompt.trimEnd().endsWith("STUDENT'S QUESTION: Do I still need BUS 393?"),
    ).toBe(true);
    expect(prompt).toContain("CONVERSATION SO FAR\nStudent: Hi");
  });
});

describe("citations", () => {
  const sources = [
    { title: "A", url: "https://a" },
    { title: "B", url: "https://b" },
  ];
  test("cited sources in first-mention order, each once", () => {
    expect(citedSources("Yes [2]. Also [1] and [2].", sources)).toEqual([
      sources[1],
      sources[0],
    ]);
  });
  test("citations to sources that weren't given are removed, not shown", () => {
    const clean = stripUnknownCitations("Fact [1]. Made up [7]. Zero [0].", 2);
    expect(clean).toBe("Fact [1]. Made up. Zero.");
    expect(citedSources(clean, sources)).toEqual([sources[0]]);
  });
});

describe("introMessage", () => {
  test("plays back the intake answers", () => {
    const withAnswers = {
      ...SAMPLE_PROFILE,
      surveyAnswers: {
        "finish-by": "steady",
        summer: "skip",
        "next-term-focus": "concentration",
      },
    };
    expect(introMessage(withAnswers, plan)).toBe(
      "From your answers: When would you like to finish your degree: at a steady pace; What should next term focus on: my concentration courses. Want to start with your Spring 2027 plan, or ask about any requirement?",
    );
  });
  test("no answers: a plain greeting", () => {
    expect(introMessage(SAMPLE_PROFILE, plan)).toMatch(/^Hi! /);
  });
});
