// Every typed stand-in for backend pieces that don't exist yet. Each is marked
// TODO(backend). Nothing here decides a requirement: these are preference questions only.

export type SurveyOption = { id: string; label: string };

export type SurveyQuestion = {
  id: string;
  text: string;
  /** Exactly 4 options; "Skip" is added by the UI. */
  options: [SurveyOption, SurveyOption, SurveyOption, SurveyOption];
  /** The "why I'm asking" line. */
  why: string;
};

export const SKIP = "skip";

// TODO(backend): replace with the team's question list (docs/intake-survey.md, "Still to
// decide") and Gemini's selection of 3 questions per student, with the code checks and
// the highest-priority fallback described there. Until then every student gets these 3.
export const MOCK_SURVEY_QUESTIONS: [
  SurveyQuestion,
  SurveyQuestion,
  SurveyQuestion,
] = [
  {
    id: "finish-by",
    text: "When would you like to finish your degree?",
    options: [
      { id: "asap", label: "As soon as I can" },
      { id: "steady", label: "At a steady pace" },
      { id: "lighter", label: "Slower, with lighter terms" },
      { id: "unsure", label: "Not sure yet" },
    ],
    why: "So your plan paces the requirements you have left.",
  },
  {
    id: "summer",
    text: "Would you take courses in the summer term?",
    options: [
      { id: "full", label: "Yes, a full load" },
      { id: "some", label: "Yes, one or two courses" },
      { id: "no", label: "No summer courses" },
      { id: "unsure", label: "Not sure yet" },
    ],
    why: "Summer courses can close gaps sooner, but not everyone wants them.",
  },
  {
    id: "next-term-focus",
    text: "What should next term focus on?",
    options: [
      { id: "concentration", label: "My concentration courses" },
      { id: "core", label: "Core BBA requirements" },
      { id: "breadth", label: "Courses outside Business" },
      { id: "balance", label: "A mix of everything" },
    ],
    why: "When several courses fit, this decides which to suggest first.",
  },
];
