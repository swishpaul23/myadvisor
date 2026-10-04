import { describe, expect, test } from "vitest";
import { applyMerge, diffRecord } from "@/lib/app/record-merge";
import type { RecordCourse } from "@/lib/app/types";

// Merging an uploaded transcript into the record. Expected results written by hand.
// Dedupe key: course code + term. A course whose only attempt moved to another term (and
// appears once in both lists) is a term change, not a new attempt.

const c = (
  code: string,
  term: string,
  grade: RecordCourse["grade"],
  extra: Partial<RecordCourse> = {},
): RecordCourse => ({
  code,
  term,
  status: grade === null ? "in_progress" : "completed",
  grade,
  institution: "SFU",
  units: null,
  ...extra,
});

const current: RecordCourse[] = [
  c("BUS 201", "2024-fall", "B"),
  c("ECON 103", "2024-fall", "B+"),
  c("BUS 312", "2026-fall", null),
  c("PSYC 100", "2025-spring", "A", { institution: "transfer", units: 3 }),
];

describe("diffRecord", () => {
  test("sorts uploaded courses into new, changed and already present", () => {
    const uploaded = [
      c("BUS 201", "2024-fall", "B"), // same
      c("BUS 312", "2026-fall", "A-"), // in progress -> completed with a grade
      c("BUS 343", "2026-fall", "B"), // new
    ];
    const diff = diffRecord(current, uploaded);
    expect(diff.added).toEqual([c("BUS 343", "2026-fall", "B")]);
    expect(diff.changed).toEqual([
      {
        before: c("BUS 312", "2026-fall", null),
        after: c("BUS 312", "2026-fall", "A-"),
        fields: ["status", "grade"],
      },
    ]);
    expect(diff.same).toEqual([c("BUS 201", "2024-fall", "B")]);
    // Not on the transcript: kept in add/update mode, removed only in replace mode.
    expect(diff.missing).toEqual([
      c("ECON 103", "2024-fall", "B+"),
      c("PSYC 100", "2025-spring", "A", { institution: "transfer", units: 3 }),
    ]);
  });

  test("a single attempt in a different term is a term change", () => {
    const diff = diffRecord(current, [c("ECON 103", "2025-spring", "B+")]);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([
      {
        before: c("ECON 103", "2024-fall", "B+"),
        after: c("ECON 103", "2025-spring", "B+"),
        fields: ["term"],
      },
    ]);
  });

  test("a retake (the code already twice, or twice on the transcript) is a new attempt", () => {
    const twice = [...current, c("ECON 103", "2025-spring", "C")];
    const diff = diffRecord(twice, [c("ECON 103", "2025-fall", "A")]);
    expect(diff.added).toEqual([c("ECON 103", "2025-fall", "A")]);
    expect(diff.changed).toEqual([]);

    const retake = diffRecord(current, [
      c("ECON 103", "2024-fall", "B+"),
      c("ECON 103", "2025-fall", "A"),
    ]);
    expect(retake.same).toEqual([c("ECON 103", "2024-fall", "B+")]);
    expect(retake.added).toEqual([c("ECON 103", "2025-fall", "A")]);
  });

  test("a retake with a different grade in a later term is a new attempt, not a term change", () => {
    const failed = [c("MATH 157", "2024-fall", "F")];
    const diff = diffRecord(failed, [c("MATH 157", "2025-spring", "B")]);
    expect(diff.added).toEqual([c("MATH 157", "2025-spring", "B")]);
    expect(diff.changed).toEqual([]);
    expect(
      applyMerge(failed, [c("MATH 157", "2025-spring", "B")], "merge"),
    ).toEqual([
      c("MATH 157", "2024-fall", "F"),
      c("MATH 157", "2025-spring", "B"),
    ]);
  });

  test("a duplicate row on the transcript counts once", () => {
    const diff = diffRecord(current, [
      c("BUS 343", "2026-fall", "B"),
      c("BUS 343", "2026-fall", "B"),
    ]);
    expect(diff.added).toEqual([c("BUS 343", "2026-fall", "B")]);
  });
});

describe("applyMerge", () => {
  const uploaded = [
    c("BUS 201", "2024-fall", "B"),
    c("BUS 312", "2026-fall", "A-"),
    c("BUS 343", "2026-fall", "B"),
  ];

  test("add/update: new course added, changed grade updated, duplicate ignored, nothing deleted", () => {
    expect(applyMerge(current, uploaded, "merge")).toEqual([
      c("BUS 201", "2024-fall", "B"),
      c("ECON 103", "2024-fall", "B+"),
      c("BUS 312", "2026-fall", "A-"),
      c("PSYC 100", "2025-spring", "A", { institution: "transfer", units: 3 }),
      c("BUS 343", "2026-fall", "B"),
    ]);
  });

  test("an update keeps units the student entered when the transcript has none", () => {
    expect(
      applyMerge(
        current,
        [c("PSYC 100", "2025-spring", "A-", { institution: "transfer" })],
        "merge",
      ),
    ).toContainEqual(
      c("PSYC 100", "2025-spring", "A-", { institution: "transfer", units: 3 }),
    );
  });

  test("replace: the record becomes exactly the uploaded list (deduped)", () => {
    expect(applyMerge(current, [...uploaded, uploaded[0]!], "replace")).toEqual(
      uploaded,
    );
  });

  test("courses are only deleted in replace mode", () => {
    const merged = applyMerge(current, uploaded, "merge");
    for (const kept of current)
      expect(merged.some((m) => m.code === kept.code)).toBe(true);
    const replaced = applyMerge(current, uploaded, "replace");
    expect(replaced.some((m) => m.code === "ECON 103")).toBe(false);
  });
});
