import { describe, expect, test } from "vitest";
import { attemptScore, gradePoints, meetsMinimum } from "@/engine/audit/grades";
import { hopcroftKarp, isMaximum } from "@/engine/audit/matching";
import { policy } from "./helpers";

const p = policy();

describe("meetsMinimum", () => {
  test.each([
    ["C-", "C-", "BUS 312", true],
    ["C+", "C-", "BUS 312", true],
    ["D", "C-", "BUS 312", false],
    ["F", null, "BUS 312", false], // blank minimum = any grade that earns units
    ["D", null, "BUS 410", true],
    ["W", null, "BUS 410", false],
    ["P", "P", "BUS 203", true],
    ["P", "C-", "BUS 300", true], // pass/fail course: P meets any minimum
    ["P", "C-", "BUS 312", true], // P meets any minimum (Stuart, 2026-10-04)
    ["P", null, "BUS 410", true], // blank minimum: P earns units
    ["CR", "C-", "ECON 105", true], // ASSUMPTION: transfer CR meets minimums
    [null, "C-", "BUS 312", false],
  ])("%s vs min %s on %s -> %s", (grade, min, code, expected) => {
    expect(meetsMinimum(grade, min, code, p)).toBe(expected);
  });
});

describe("gradePoints and attempt choice", () => {
  test("points; P, W, CR carry none; F counts as 0", () => {
    expect(gradePoints("A+", p)).toBe(4.33);
    expect(gradePoints("C-", p)).toBe(1.67);
    expect(gradePoints("F", p)).toBe(0);
    for (const g of ["P", "W", "CR", null])
      expect(gradePoints(g, p)).toBeNull();
  });

  test("best attempt: letters by rank, then P/CR, then D, F, W", () => {
    const order = ["A+", "C-", "P", "D", "F", "W"].map((g) =>
      attemptScore(g, p),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("Hopcroft-Karp", () => {
  test("greedy fails, maximum matching succeeds", () => {
    // Slot A can take course X or Y; slot B only X. Greedy (A takes its first option X)
    // leaves B empty. Hopcroft-Karp finds A<-Y, B<-X.
    const adjacency = [
      [0, 1], // A: X, Y
      [0], // B: X
    ];
    const greedyB = (() => {
      const taken = new Set<number>();
      return adjacency.map((options) => {
        const pick = options.find((o) => !taken.has(o));
        if (pick !== undefined) taken.add(pick);
        return pick ?? -1;
      })[1];
    })();
    expect(greedyB).toBe(-1);

    const m = hopcroftKarp(adjacency, 2);
    expect(m.size).toBe(2);
    expect(m.matchLeft).toEqual([1, 0]);
    expect(isMaximum(adjacency, m)).toBe(true); // I3
  });

  test("deterministic and maximum on a larger random graph (I3, I5)", () => {
    let seed = 7;
    const rand = () =>
      (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const adjacency = Array.from({ length: 30 }, () =>
      Array.from({ length: 25 }, (_, r) => r).filter(() => rand() < 0.12),
    );
    const a = hopcroftKarp(adjacency, 25);
    const b = hopcroftKarp(adjacency, 25);
    expect(a).toEqual(b);
    expect(isMaximum(adjacency, a)).toBe(true);
    // I1: no course used twice
    const used = a.matchLeft.filter((r) => r !== -1);
    expect(new Set(used).size).toBe(used.length);
  });
});
