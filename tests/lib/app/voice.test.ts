import { describe, expect, test } from "vitest";
import {
  MAX_SPOKEN_CHARS,
  speakableText,
  spokenTranscript,
} from "@/lib/app/voice";

// Expected results are written by hand from what a listener should hear, not copied from
// the function's output.

describe("speakableText", () => {
  test("drops citation markers and the space before them", () => {
    expect(
      speakableText(
        "Yes, BUS 313 is required for Finance [1]. See also [2][3].",
      ),
    ).toBe("Yes, BUS 313 is required for Finance. See also.");
  });

  test("drops grouped citation markers", () => {
    expect(speakableText("You need 120 units [1, 2] to graduate.")).toBe(
      "You need 120 units to graduate.",
    );
  });

  test("keeps course codes and numbers that aren't citations", () => {
    expect(speakableText("Take BUS 207 and ECON 103 in 2027.")).toBe(
      "Take BUS 207 and ECON 103 in 2027.",
    );
  });

  test("drops bare URLs", () => {
    expect(
      speakableText(
        "Check the calendar at https://www.sfu.ca/students/calendar/2026/fall.html for details.",
      ),
    ).toBe("Check the calendar at for details.");
  });

  test("keeps the sentence's end punctuation after a URL", () => {
    expect(
      speakableText("Details are at https://www.sfu.ca/bba.html. Ask me more."),
    ).toBe("Details are at. Ask me more.");
  });

  test("drops www links and URLs in parentheses", () => {
    expect(
      speakableText("The Beedie site (www.sfu.ca/beedie) lists the courses."),
    ).toBe("The Beedie site lists the courses.");
  });

  test("keeps the words of a markdown link, drops its URL", () => {
    expect(
      speakableText(
        "Read the [BBA requirements](https://www.sfu.ca/bba.html) page.",
      ),
    ).toBe("Read the BBA requirements page.");
  });

  test("drops markdown emphasis, code ticks and heading marks", () => {
    expect(speakableText("## Summary\n**BUS 393** is `not` needed.")).toBe(
      "Summary\nBUS 393 is not needed.",
    );
  });

  test("keeps line breaks between list items, collapses extra blank lines", () => {
    expect(speakableText("Next term:\n\n\n- BUS 312 [1]\n- BUS 315")).toBe(
      "Next term:\n\n- BUS 312\n- BUS 315",
    );
  });

  test("text that is only citations and links is empty", () => {
    expect(speakableText(" [1] https://www.sfu.ca [2] ")).toBe("");
  });

  test("long answers are cut at the last sentence that fits", () => {
    const sentence = "This sentence is exactly forty chars ok. ";
    expect(sentence.length).toBe(41);
    const text = sentence.repeat(100);
    const spoken = speakableText(text);
    expect(spoken.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(spoken.endsWith("chars ok.")).toBe(true);
    expect(spoken).toBe(
      sentence.repeat(Math.floor((MAX_SPOKEN_CHARS + 1) / 41)).trim(),
    );
  });
});

describe("spokenTranscript", () => {
  test("trims the transcript", () => {
    expect(spokenTranscript("  Do I still need BUS 393?  ")).toBe(
      "Do I still need BUS 393?",
    );
  });

  test("audio-event tags alone mean no speech", () => {
    expect(spokenTranscript("(silence)")).toBe("");
    expect(spokenTranscript(" (background noise) (music) ")).toBe("");
  });

  test("keeps speech around audio-event tags", () => {
    expect(spokenTranscript("(cough) What's left for Finance?")).toBe(
      "What's left for Finance?",
    );
  });

  test("empty or missing text is no speech", () => {
    expect(spokenTranscript("")).toBe("");
    expect(spokenTranscript(undefined)).toBe("");
  });
});
