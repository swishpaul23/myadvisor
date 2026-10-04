import { describe, expect, test } from "vitest";
import { audit } from "@/engine/audit";
import type { ReqResult } from "@/engine/audit/types";
import { catalog, course, realCatalog, row, student, took } from "./helpers";

const result = (results: ReqResult[], id: string) =>
  results.find((r) => r.reqId === id)!;

describe("slot rows (one course, n courses with a list, all of)", () => {
  const cat = catalog(
    [
      row({ req_id: "a", courses: ["BUS 312", "BUS 315"], min_grade: "C-" }),
      row({ req_id: "b", courses: ["BUS 312"], min_grade: "C-" }),
      row({
        req_id: "c",
        rule: "all of",
        courses: ["BUS 343", "BUS 360W"],
        n_or_units: null,
      }),
      row({
        req_id: "d",
        rule: "n courses",
        n_or_units: 2,
        courses: ["BUS 410", "BUS 411", "BUS 412"],
      }),
    ],
    [
      "BUS 312",
      "BUS 315",
      "BUS 343",
      "BUS 360W",
      "BUS 410",
      "BUS 411",
      "BUS 412",
    ].map((c) => course(c, 3)),
  );

  test("matching, not greedy: a takes BUS 315 so b can take BUS 312", () => {
    const { results } = audit(
      student([took("BUS 312", "B"), took("BUS 315", "B")]),
      cat,
    );
    expect(result(results, "a")).toMatchObject({
      status: "met",
      usedCourses: ["BUS 315"],
    });
    expect(result(results, "b")).toMatchObject({
      status: "met",
      usedCourses: ["BUS 312"],
    });
  });

  test("a course fills one slot per pool; the other row says where it went", () => {
    const { results } = audit(student([took("BUS 312", "B")]), cat);
    const [a, b] = [result(results, "a"), result(results, "b")];
    expect([a.status, b.status].sort()).toEqual(["met", "unmet"]);
    const unmet = a.status === "unmet" ? a : b;
    expect(unmet.notes.join(" ")).toMatch(
      /BUS 312 is eligible but is used for/,
    );
  });

  test("min grade, all of, n courses, in progress", () => {
    const { results } = audit(
      student([
        took("BUS 312", "D"),
        took("BUS 343", "B"),
        took("BUS 360W", null),
        took("BUS 410", "C"),
        took("BUS 411", "B"),
      ]),
      cat,
    );
    expect(result(results, "b").status).toBe("unmet"); // D < C-
    expect(result(results, "c")).toMatchObject({
      status: "in_progress",
      progress: { have: 1, need: 2 },
    });
    expect(result(results, "d")).toMatchObject({
      status: "met",
      progress: { have: 2, need: 2 },
    });
  });
});

describe("within (subset rows solved in the parent's matching)", () => {
  const list = ["BUS 345", "BUS 441", "BUS 347", "BUS 443", "BUS 446"];
  const cat = catalog(
    [
      row({
        req_id: "total",
        concentration: "Marketing",
        rule: "n courses",
        n_or_units: 4,
        courses: list,
      }),
      row({
        req_id: "analytics",
        concentration: "Marketing",
        rule: "n courses",
        n_or_units: 1,
        courses: ["BUS 345", "BUS 441"],
        filter: ["within total"],
      }),
      row({
        req_id: "consumer",
        concentration: "Marketing",
        rule: "n courses",
        n_or_units: 1,
        courses: ["BUS 347", "BUS 443"],
        filter: ["within total"],
      }),
    ],
    list.map((c) => course(c, 3)),
  );
  const marketing = (codes: string[]) =>
    audit(
      student(
        codes.map((c) => took(c, "B")),
        { declaredConcentrations: ["Marketing"] },
      ),
      cat,
    ).results;

  test("children's courses count toward the parent, never as extra courses", () => {
    const r = marketing(["BUS 345", "BUS 347", "BUS 441", "BUS 446"]);
    expect(result(r, "total")).toMatchObject({
      status: "met",
      progress: { have: 4, need: 4 },
    });
    expect(result(r, "analytics").status).toBe("met");
    expect(result(r, "consumer").status).toBe("met");
    expect(result(r, "total").usedCourses).toEqual([
      "BUS 345",
      "BUS 347",
      "BUS 441",
      "BUS 446",
    ]);
  });

  test("four courses but none in a subset: parent not met", () => {
    const r = marketing(
      ["BUS 345", "BUS 441", "BUS 446", "BUS 443"]
        .slice(0, 3)
        .concat("BUS 441"),
    );
    expect(result(r, "consumer").status).toBe("unmet");
    expect(result(r, "total").status).toBe("unmet");
  });
});

describe("overlays: units from, filter-only n courses", () => {
  test("units from with level and dept; filter-only count with exclude and if-SFU", () => {
    const cat = catalog(
      [
        row({
          req_id: "units",
          rule: "units from",
          n_or_units: 6,
          level_min: 300,
          level_max: 499,
          filter: ["subject business"],
        }),
        row({
          req_id: "four",
          rule: "n courses",
          n_or_units: 2,
          level_min: 400,
          level_max: 499,
          filter: [
            "dept BUS",
            "exclude BUS 478",
            "if institution SFU then course_units >= 3",
          ],
        }),
      ],
      [
        course("BUS 303", 3),
        course("BUS 410", 3),
        course("BUS 478", 3),
        course("BUS 498", 0),
        course("ECON 302", 3),
      ],
    );
    const { results } = audit(
      student([
        took("BUS 303", "B"),
        took("ECON 302", "B"),
        took("BUS 478", "B"),
        took("BUS 498", "P"),
        took("BUS 410", "B", { institution: "transfer" }),
      ]),
      cat,
    );
    expect(result(results, "units")).toMatchObject({
      status: "met",
      progress: { have: 9 },
    }); // 303 + 478 + 410
    // BUS 410 transfer passes the if-SFU rule; BUS 478 excluded; BUS 498 is 0 units at SFU
    expect(result(results, "four")).toMatchObject({
      status: "unmet",
      progress: { have: 1 },
      usedCourses: ["BUS 410"],
    });
  });

  test("unit totals count each course once, however many rows it fills (firm rule)", () => {
    const real = realCatalog();
    // BUS 418 is the only upper-global course taken; BUS 412 and 414 are Finance-only.
    const s = student(
      [took("BUS 418", "B"), took("BUS 412", "B"), took("BUS 414", "B")],
      { declaredConcentrations: ["Finance"] },
    );
    const { results, summary } = audit(s, real);
    // BUS 418 fills upper-global (core pool) and finance-electives (Finance pool) ...
    expect(result(results, "upper-global").usedCourses).toEqual(["BUS 418"]);
    expect(result(results, "finance-electives").usedCourses).toEqual([
      "BUS 412",
      "BUS 414",
      "BUS 418",
    ]);
    expect(result(results, "upper-global").notes.join(" ")).toMatch(
      /BUS 418 also counts toward finance-electives/,
    );
    // ... but its 3 units count once: 3 courses x 3 units = 9 in 120 and 44/45 upper.
    expect(summary.earnedUnits).toBe(9);
    expect(result(results, "univ-total").progress.have).toBe(9);
    expect(result(results, "univ-upper").progress.have).toBe(9);
    expect(result(results, "beedie-upper-total").progress.have).toBe(9);
    expect(result(results, "beedie-nonbus").progress.have).toBe(0);
  });
});

describe("GPA", () => {
  const cat = catalog(
    [
      row({
        req_id: "gpa",
        rule: "minimum GPA",
        n_or_units: 2,
        courses: [],
        filter: ["all courses"],
      }),
    ],
    [
      course("BUS 201", 3),
      course("BUS 237", 3),
      course("BUS 203", 1),
      course("ECON 105", 3),
      course("BUS 251", 3),
    ],
  );
  const gpa = (courses: ReturnType<typeof took>[]) =>
    result(audit(student(courses), cat).results, "gpa");

  test("repeat: the higher grade counts", () => {
    expect(
      gpa([took("BUS 201", "D"), took("BUS 201", "B")]).progress.have,
    ).toBe(3);
  });
  test("transfer CR, P and W excluded; F counts as 0", () => {
    const r = gpa([
      took("BUS 201", "A"),
      took("ECON 105", "CR", { institution: "transfer" }),
      took("BUS 203", "P"),
      took("BUS 237", "W"),
      took("BUS 251", "F"),
    ]);
    expect(r.progress.have).toBe(2); // (4.00x3 + 0x3) / 6
    expect(r.status).toBe("met");
  });
  test("no graded courses -> unknown", () => {
    expect(gpa([took("BUS 203", "P")])).toMatchObject({
      status: "unknown",
      progress: { have: null },
    });
  });
  test("units unknown for a graded course -> unknown", () => {
    expect(gpa([took("ZZZ 101", "A")]).status).toBe("unknown");
  });
  test("program courses -> unknown with the reason", () => {
    const c = catalog(
      [
        row({
          req_id: "p",
          rule: "minimum GPA",
          n_or_units: 2,
          filter: ["program courses"],
        }),
      ],
      [],
    );
    const { results, unknowns } = audit(student([took("BUS 201", "A")]), c);
    expect(result(results, "p").status).toBe("unknown");
    expect(unknowns[0]!.reason).toMatch(/program courses are not defined/);
  });
});

describe("breadth buckets", () => {
  const real = realCatalog();
  const breadth = (codes: [string, string][]) =>
    audit(student(codes.map(([c, g]) => took(c, g))), real).results;

  test("a W + B-Hum course counts for W and for exactly one bucket (I2)", () => {
    const r = breadth([["ENGL 112W", "A"]]);
    expect(result(r, "univ-writing").progress.have).toBe(3);
    const buckets = [
      "univ-breadth-social",
      "univ-breadth-humanities",
      "univ-breadth-science",
      "univ-breadth-additional",
    ];
    const holding = buckets.filter((id) =>
      result(r, id).usedCourses.includes("ENGL 112W"),
    );
    expect(holding).toHaveLength(1);
  });

  test("a course below C- earns no breadth credit", () => {
    const r = breadth([["GEOG 100", "D"]]);
    expect(result(r, "univ-breadth-social").progress.have).toBe(0);
    expect(result(r, "univ-wqb-grade").notes.join(" ")).toMatch(
      /GEOG 100 \(D\) earns no W\/Q\/B credit/,
    );
  });

  test("no course sits in two buckets, across a full set", () => {
    const r = breadth([
      ["GEOG 100", "B"],
      ["HIST 135", "B"],
      ["INDG 101", "B"],
      ["IS 101", "B"],
      ["ENGL 112W", "B"],
      ["CMNS 110", "B"],
    ]);
    const ids = [
      "univ-breadth-social",
      "univ-breadth-humanities",
      "univ-breadth-science",
      "univ-breadth-additional",
    ];
    const all = ids.flatMap((id) => result(r, id).usedCourses);
    expect(new Set(all).size).toBe(all.length);
    expect(result(r, "univ-breadth-social").status).toBe("met");
    expect(result(r, "univ-breadth-humanities").status).toBe("met");
    expect(result(r, "univ-breadth-additional").status).toBe("met");
  });

  test("a bucket short on units takes another course", () => {
    const c = catalog(
      [
        row({
          req_id: "soc-units",
          rule: "units from",
          n_or_units: 6,
          designation: ["B-Soc"],
          filter: ["subject outside major"],
          min_grade: "C-",
        }),
        row({
          req_id: "soc-count",
          rule: "n courses",
          n_or_units: 2,
          designation: ["B-Soc"],
          filter: ["subject outside major"],
          min_grade: "C-",
        }),
      ],
      [
        course("POL 100", 2, ["B-Soc"]),
        course("POL 101", 2, ["B-Soc"]),
        course("POL 102", 3, ["B-Soc"]),
      ],
    );
    const r = audit(
      student([
        took("POL 100", "B"),
        took("POL 101", "B"),
        took("POL 102", "B"),
      ]),
      c,
    ).results;
    expect(result(r, "soc-units")).toMatchObject({
      status: "met",
      progress: { have: 7 },
    });
  });
});

describe("unknown, not_applicable, admission term", () => {
  const real = realCatalog();

  test("course with no data needed for a designation row -> unknown", () => {
    // PSYC 106 has no course data (designation unknown); student gave 3 units.
    const r = audit(
      student([took("BPK 140", "B"), took("PSYC 106", "A", { units: 3 })]),
      real,
    );
    // Group A needs no designation, so PSYC 106 counts there.
    expect(result(r.results, "beedie-nonbus-group-a").progress.have).toBe(6);
    // B-Sci: BPK 140 alone is 1 course / 3 units; with PSYC 106 it could be 2 / 6.
    const sci = result(r.results, "univ-breadth-science");
    expect(sci.status).toBe("unknown");
    expect(sci.notes.join(" ")).toMatch(/designation of PSYC 106 unknown/);
    expect(r.unknowns.map((u) => u.reqId)).toContain("univ-breadth-science");
  });

  test("a BUS 49x topics course needed by finance-electives -> unknown", () => {
    const s = student(
      [
        took("BUS 410", "B"),
        took("BUS 411", "B"),
        took("BUS 490", "B", { units: 3 }),
      ],
      {
        declaredConcentrations: ["Finance"],
      },
    );
    const fe = result(audit(s, real).results, "finance-electives");
    expect(fe.status).toBe("unknown");
    expect(fe.notes.join(" ")).toMatch(/BUS 490 is a topics course/);
  });

  test("out-of-scope rows and undeclared concentrations are not_applicable", () => {
    const r = audit(student([]), real).results;
    expect(result(r, "beedie-residency-total").status).toBe("not_applicable");
    expect(result(r, "accounting-bus320").status).toBe("not_applicable");
  });

  test("BUS 203/300/496 for admissions before 2022-fall -> unknown", () => {
    const r = audit(
      student([took("BUS 203", "P")], { admissionTerm: "2021-fall" }),
      real,
    );
    const row203 = result(r.results, "lower-bus203");
    expect(row203.status).toBe("unknown");
    expect(r.unknowns.find((u) => u.reqId === "lower-bus203")!.reason).toBe(
      "different requirement set for this admission term",
    );
  });

  test("completed concentrations counts declared concentrations with every row met", () => {
    const s = student(
      ["BUS 313", "BUS 315", "BUS 410", "BUS 411", "BUS 412"].map((c) =>
        took(c, "B"),
      ),
      { declaredConcentrations: ["Finance"] },
    );
    expect(
      result(audit(s, real).results, "upper-concentration-completion"),
    ).toMatchObject({
      status: "met",
      progress: { have: 1, need: 1 },
    });
  });
});

describe("unknown in slot pools is decided per row", () => {
  test("a topics course two rows could use: each row is unknown, neither is unmet", () => {
    const cat = catalog(
      [
        row({
          req_id: "first",
          concentration: "Finance",
          group: "Concentration",
          courses: ["BUS 490", "BUS 410"],
        }),
        row({
          req_id: "second",
          concentration: "Finance",
          group: "Concentration",
          courses: ["BUS 490"],
        }),
      ],
      [course("BUS 490", 3), course("BUS 410", 3)],
    );
    const r = audit(
      student([took("BUS 490", "B")], { declaredConcentrations: ["Finance"] }),
      cat,
    ).results;
    expect(result(r, "first").status).toBe("unknown");
    expect(result(r, "second").status).toBe("unknown");
  });
});
