import { describe, expect, test } from "vitest";
import { audit } from "@/engine/audit";
import { demoStudent } from "./fixtures/demo-student";
import {
  expectedRows,
  expectedSummary,
} from "./fixtures/demo-student.expected";
import { realCatalog } from "./helpers";

// Compares the engine with the hand-computed expected audit. If this fails, do not edit the
// expected file to match: decide which side is wrong.

const result = audit(demoStudent, realCatalog());
const byId = new Map(result.results.map((r) => [r.reqId, r]));

describe("demo student audit vs hand-computed expectation", () => {
  test("summary", () => {
    expect(result.summary.earnedUnits).toBe(expectedSummary.earnedUnits);
    expect(result.summary.inProgressUnits).toBe(
      expectedSummary.inProgressUnits,
    );
    expect(result.summary.byStatus).toEqual(expectedSummary.byStatus);
  });

  test.each(Object.entries(expectedRows))("%s", (id, expected) => {
    const actual = byId.get(id)!;
    expect(actual, `no result for ${id}`).toBeDefined();
    expect(actual.status).toBe(expected.status);
    if (expected.have !== undefined)
      expect(actual.progress.have).toBe(expected.have);
    if (expected.need !== undefined)
      expect(actual.progress.need).toBe(expected.need);
    if (expected.used !== undefined)
      expect(actual.usedCourses).toEqual(expected.used);
  });

  test("the same input gives the same audit (I5)", () => {
    expect(audit(demoStudent, realCatalog())).toEqual(result);
  });
});
