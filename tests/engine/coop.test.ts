import { describe, expect, test } from "vitest";
import { defaultCoopTerms } from "@/engine/plan/coop";

// Default co-op placement (Stuart, 2026-10-04): when the student is doing co-op but picks
// no work terms, plan one 8-month placement (Fall + Spring) plus one more work term.
// ASSUMPTION: at least one study term (the start term) comes before the first work term;
// the SFU calendar's co-op timing rules aren't checked. Worked out by hand:
//   start 2027-spring, no summer:  Fall 2027 + Spring 2028; then Fall 2028 is studied
//                                  (summer skipped), so the third is Spring 2029
//   start 2027-spring, summer:     Fall 2027 + Spring 2028; Summer 2028 studied; Fall 2028
//   start 2027-fall, no summer:    the first Fall after the start is Fall 2028
//   start 2027-summer, no summer:  Fall 2027 + Spring 2028; Fall 2028 studied; Spring 2029

describe("defaultCoopTerms", () => {
  test.each([
    ["2027-spring", "none", ["2027-fall", "2028-spring", "2029-spring"]],
    ["2027-spring", "full", ["2027-fall", "2028-spring", "2028-fall"]],
    ["2027-spring", "some", ["2027-fall", "2028-spring", "2028-fall"]],
    ["2027-fall", "none", ["2028-fall", "2029-spring", "2030-spring"]],
    ["2027-summer", "none", ["2027-fall", "2028-spring", "2029-spring"]],
  ] as const)("start %s, summer %s -> %o", (start, summer, expected) => {
    expect(defaultCoopTerms(start, summer)).toEqual(expected);
  });
});
