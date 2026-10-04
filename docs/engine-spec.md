# Audit engine spec (v0, for review before implementation)

Code computes every fact; the LLM only explains (CLAUDE.md §1). The audit engine lives in `src/engine/audit/`: pure TypeScript, no I/O. Data arrives as arguments and results are return values. Every **ASSUMPTION** below needs Stuart's confirmation; every **OPEN** item is undecided and is reported, not decided.

## 1. Inputs

```ts
type Student = {
  admissionTerm: string;                  // "2024-fall"
  declaredConcentrations: string[];       // one of the 9 names in schema.ts CONCENTRATIONS
  courses: StudentCourse[];
};
type StudentCourse = {
  code: string;                           // "BUS 217W"
  grade: string | null;                   // A+..D, F, FD, N, P, W, CR; null while in progress/planned
  units?: number;                         // student-supplied; used only when courses.json has no units
  term: string;                           // "2025-fall"
  institution: "SFU" | "transfer";
  status: "completed" | "in_progress" | "planned";
};
type Catalog = {
  requirements: RequirementRow[];         // data/generated/requirements.json
  courses: Course[];                      // data/generated/courses.json
  unknownCourses: UnknownCourse[];        // data/generated/unknown-courses.json
  policy: Policy;                         // data/policy/sfu.json (section 5)
};
type AuditOptions = { includePlanned?: boolean }; // default false
```

- The audit counts **completed** courses. `in_progress` (and `planned` when `includePlanned` is set) count only in the second tier (section 2, "in_progress").
- Course facts come from the code: department (`BUS`), number (`217`), level (hundreds, 200). Everything else comes from courses.json: units, designations. If a course isn't in courses.json, units come from `units?` and designations are **unknown**.
- **Repeats:** attempts are grouped by code. For requirements, the best completed attempt counts. For GPA, only the higher-grade attempt counts (policy). For units, the course counts once.
- **Earned units:** a completed attempt earns units with grade A+..D, P, or CR. F, FD, N and W earn 0.
- **ASSUMPTION:** a transfer course is entered under its SFU-equivalent code and takes that course's designations from courses.json. Unassigned transfer codes (e.g. "BUS 1XX") have no data, so they are handled as unknown.
- **ASSUMPTION:** the student is in their first bachelor's degree, so `degree first_bachelors` is true and `degree second_bachelors` rows are out of scope anyway.

## 2. Output

```ts
type ReqResult = {
  reqId: string;
  status: "met" | "unmet" | "in_progress" | "unknown" | "not_applicable";
  progress: { have: number; need: number; unit: "courses" | "units" | "gpa" | "concentrations" | "violations" };
  usedCourses: string[];   // codes that count toward this row
  missing: string[];       // eligible codes not yet taken (slot rows) or a short description
  notes: string[];         // shared courses, unchecked constraints, assumptions that applied
  sourceUrl: string;
  dataStatus: "beta" | "verified" | "out-of-scope";
};
type AuditResult = {
  results: ReqResult[];    // one per requirements.json row, in sheet order
  summary: { byStatus: Record<Status, number>; earnedUnits: number; inProgressUnits: number;
             gpas: Record<string, number | null>; declaredConcentrations: string[] };
  unknowns: { reqId: string; reason: string }[];
};
```

The status for each row is decided in tiers:

1. Evaluate on **completed** courses. If met, the status is `met`.
2. Otherwise evaluate on completed plus in_progress (plus planned with `includePlanned`). If met, the status is `in_progress`.
3. Otherwise, if some course with missing data could make the row met, the status is `unknown` with a reason.
4. Otherwise the status is `unmet`.

A row is `not_applicable` when its status is `out-of-scope` (skipped, reason in notes, never `unknown`), or when it belongs to a concentration the student hasn't declared.

## 3. Rule and filter semantics

**Course eligibility.** A course is eligible for a row when all of these hold:

- its code is in `courses` (if the list is non-empty), or in the union of the lists named by `from_reqs`;
- `level_min ≤ number ≤ level_max`;
- it has at least one of the row's `designation` values;
- every filter term holds;
- its grade meets `min_grade`.

Grade order is A+ > A > … > D. A `P` satisfies the pass/fail courses BUS 203, BUS 300 and BUS 496 (policy `pass_fail_courses`, decided) and no other letter minimum. **ASSUMPTION:** CR (transfer) meets any minimum, with a note "transfer credit: grade not known".

**ASSUMPTION (OPEN-4, decided as the default, to be verified against the calendar):** a blank `min_grade` (all concentration rows) means any passing grade (D or better, P, CR). The row gets a note that C- may apply if the course is also a prerequisite.

**Admission term (decided):** rows for BUS 203/300/496 (policy `admission_gated_courses`) apply to students admitted 2022-fall or later. Earlier admissions get `unknown` with the reason "different requirement set for this admission term".

| Rule | Meaning | Kind |
|---|---|---|
| `one course` | 1 eligible course | slot |
| `n courses` with a `courses` list | n distinct eligible courses | slot |
| `n courses` without a list (filters only) | n distinct eligible courses, counted not consumed | overlay |
| `all of` | every course in `courses` | slot |
| `units from` | sum of units of eligible courses ≥ n | overlay |
| `minimum GPA` | GPA over eligible graded attempts ≥ n (section 5) | overlay |
| `minimum grade` | every course *used* by the rows the filter selects meets `min_grade`; `have` = violations | overlay |
| `completed concentrations` | number of declared concentrations whose rows are all met ≥ n | derived |
| `maximum breadth allocations per course` | each course sits in at most n breadth buckets (enforced by section 4) | constraint |

| Filter term | Meaning |
|---|---|
| `dept X` / `dept X,Y` / `dept not in X,Y` | department of the code in / not in the list |
| `institution SFU` | attempt's institution is SFU |
| `course_units >= N` | the course's units ≥ N |
| `if institution SFU then course_units >= N` | transfer attempts pass; SFU attempts need units ≥ N |
| `exclude A\|B` | code not in the list |
| `subject outside major` / `subject in major` | department not in / in `policy.majorSubjects` |
| `subject business` | **ASSUMPTION:** department is BUS (OPEN-6: BUEC?) |
| `outside Beedie` | **ASSUMPTION:** department is not BUS and not BUEC (OPEN-7) |
| `purpose graduation` / `purpose entry_to_300_400_BUS` | computed the same way; the purpose is copied to notes (the plan validator uses entry) |
| `group X\|Y` | for `minimum grade`: the courses used by rows in those groups |
| `from_reqs A\|B` | eligible codes = union of rows A and B's `courses` |
| `program courses` | **unknown**: the data doesn't define which courses are "program courses" (OPEN-5) |
| `all courses` | every graded attempt (cumulative GPA) |
| `degree first_bachelors` | true (section 1 assumption) |
| `earned_units >= N` | the student's total earned units ≥ N (gate). Only used by an out-of-scope row today |
| `level upper\|lower\|NNN`, `not allocated to designated breadth` | handled by level_min/max and section 4 |

`designation` requires credit to be earned: the course must have a grade of C- or better (policy `wqbMinGrade`) to count for W/Q/B.

**Minimum grade rows (settled in Phase 1).**
- **`group` rows** (`beedie-core-grade`): completed courses named by the selected groups' rows whose grade is below the minimum count as violations. The row is met when there are none.
- **Designation rows** (`univ-wqb-grade`): informational. Courses below C- are listed in the notes as earning no W/Q/B credit, and the row stays met. A D in a W course doesn't fail the degree; the course just doesn't count for W.

**GPA (settled in Phase 1).** GPAs count SFU attempts only. Transfer credit carries no SFU grade points.

## 4. Slot vs overlay, and matching

**Overlay** rows (units, GPA, filter-only counts, designation counts, minimum grade) read the course pool without consuming it. Any number of overlay rows may use the same course.

**Slot** rows (`one course`, `n courses` with a list, `all of`) consume courses. Each slot row r becomes n_r slot vertices. Each distinct course code (best attempt) is one course vertex. There is an edge when the course is eligible for r. Slots are filled with a **maximum bipartite matching (Hopcroft-Karp)**, never greedily.

- **Pools.** Matching runs separately per pool:
  - one pool for all Lower core and Upper core slot rows;
  - one pool per declared concentration.
  - A course is used at most once **within** a pool.
  - Use **across** pools (core and concentration, or two concentrations) is allowed, and every shared course is listed in the notes of both rows. OPEN-1 and OPEN-2 stay OPEN, to be confirmed with an advisor.
- **Unit totals (firm rule):** `univ-total` (120), `univ-upper` / `beedie-upper-total` (44/45 upper) and `beedie-nonbus` (36 non-BUS) count each course **once**, however many requirements it fills.
- **Determinism.** Rows are ordered by sheet order and courses by code. The first augmenting path found in that order wins, so the same input always gives the same matching.
- **Subset rows (`within <req_id>`, approved).** `marketing-analytics` and `marketing-consumer-behaviours` are `within marketing-total`; `upper-400-sfu` is `within upper-400-courses`.
  - **Slot parent:** each child gets n_child slots (eligible = child ∧ parent). The parent keeps n_parent − Σ n_child slots of its own. All of them go in one matching. The parent's used courses = its own slots plus the children's slots, so a child never adds extra courses.
  - **Overlay parent:** the child's eligibility is child ∧ parent.
- **Unmet with a fix available.** When a row is unmet but an eligible course was matched to another row in the same pool, the note names that course and that row. A maximum matching minimises unfilled slots in total; it doesn't prefer any one row.

**Breadth (B-Soc, B-Hum, B-Sci, additional).**

- The buckets come from rows `univ-breadth-{social,humanities,science,additional}` and their `-course-count` twins. Each bucket needs ≥ 2 courses and ≥ 6 units.
- Eligibility:
  - designated buckets: designation matches, department outside major, C- or better;
  - additional: any course outside major with C- or better, whether or not it has a B designation.
- Matching: each bucket starts with 2 slots and Hopcroft-Karp runs once. While a bucket has ≥ 2 courses but < 6 units and unmatched eligible courses remain, that bucket gets one more slot and matching augments from the current solution. This stops after at most (number of courses) rounds.
- `univ-breadth-total` (24 units) = the units of all outside-major courses with C- or better that can be allocated to some bucket. Because the additional bucket accepts any outside-major course, this is every such course. **ASSUMPTION**, flagged in notes.
- W and Q are overlays, independent of breadth allocation, so one course can count for W and for one B bucket.

**Invariants (asserted in tests):**

- (I1) Within a pool, no course fills two slots.
- (I2) No course is in two breadth buckets.
- (I3) The matching is maximum: no augmenting path exists.
- (I4) Overlay rows never change the matching.
- (I5) The same input always gives the same result.
- (I6) No row is `met` unless every used course is completed and eligible.

## 5. Policy (`data/policy/sfu.json`, extended in Phase 1)

The file already has the grade points (A+ 4.33 … D 1.00, F/FD/N 0.00), that P and W carry no points, higher-grade-counts for repeats, CR excluded from GPA, and the C- minimum for W/Q/B. Phase 1 adds, each with `status: "beta"`:

- `majorSubjects: ["BUS"]`. **ASSUMPTION**, to verify: is BUEC in major?
- `busGpaSubjects: ["BUS"]`: the BUS GPA counts BUS courses only (per Stuart).
- `passingGrades` and the grade order used for `min_grade`.

**GPA** = Σ(points × units) / Σ(units) over completed attempts with a letter grade (A+…F, FD, N). Excluded: P, W, CR, in-progress. For repeats, only the higher-grade attempt counts. If any counted attempt has no units, or the filter is `program courses`, the GPA is `unknown`. If there are no graded attempts, the GPA is `null`, and the row is `unknown` with the reason "no graded courses yet".

## 6. Unknown, never a guess

Each unknown carries a reason string. A row is `unknown` only if it isn't met without the indeterminate courses but could be met with them.

That "could" is decided **per row, or per breadth bucket**. Only that row's slots may use the indeterminate courses; every other row uses definite courses only. Otherwise a row could be crowded out by another row's "what if".

- **Course with no data** (not in courses.json, no `units`) → "no course data for X: units unknown". If units are given but the row needs designations: "designation of X unknown".
- **Topics courses BUS 490–495** in concentration elective lists → "topics course: topic not recorded". The student input has no topic field.
- **Data we don't have** → `program courses` GPA rows; GPA attempts without units.
- **Out-of-scope rows** → `not_applicable` with the reason in notes, never `unknown`.
- **Constraints only stated in `notes`** are not checked. The row's notes say so explicitly. Examples: "within last 60 degree units" (`upper-business-units`), "complete before 75th unit" (`upper-bus360w`), "applies to entrants Fall 2022 onward" (BUS 203/300/496).

## 7. Concentrations

- Only rows of `declaredConcentrations` are evaluated. Each concentration is evaluated independently, in its own matching pool. Other concentrations' rows are `not_applicable`.
- `upper-concentration-completion` = the number of declared concentrations with all rows met.
- A course used by two declared concentrations is reported in both rows' notes. The engine doesn't decide (OPEN-1).

**OPEN questions**

1. May one course count toward two concentrations? Default: allowed, with notes. **Still OPEN** (advisor).
2. May a course fill a core slot and a concentration slot (e.g. BUS 418 in `upper-global` and `finance-electives`)? Default: allowed, with notes. **Still OPEN** (advisor).
3. ~~Subset rows~~: decided, `within <req_id>` (section 4).
4. Concentration rows' blank `min_grade`: any passing grade, with a note. ASSUMPTION, to be verified against the calendar.
5. "Program courses" for `gpa-program` / `gpa-program-ud`: decided, report `unknown` with the reason.
6. Does `subject business` include BUEC?
7. Does `outside Beedie` exclude BUEC?
8. P only satisfies BUS 203/300/496 (decided). CR satisfies any minimum, with a note (default).
9. BUS 203/300/496 for admissions before 2022-fall: decided, `unknown` with the reason "different requirement set for this admission term".
10. "Within last 60 degree units" for `upper-business-units`: check it by term order in v1, or leave it as note-only? Default: note-only.
11. The data/sources checklist says 2.30 for "overall SFU BUS GPA" and the sheet has `beedie-bus-gpa-*` at 2.3: confirm which BUS courses count (BUS only, per section 5).

## 8. Test plan (Phase 1, tests before code for each rule type)

- **Rule units:** one test file per rule type and filter term, with small inline catalogs, covering eligibility, min_grade, P and CR, levels, designations, `if institution SFU then`, exclude, from_reqs, and subject in/outside major.
- **Matching:** row A eligible {X, Y}, row B eligible {X}. Greedy in sheet order gives A←X and leaves B unfilled; Hopcroft-Karp gives A←Y, B←X. Also: a real-data case where `upper-global` and `upper-organization-or-hr` compete, plus checks of invariants I1–I3 and I5.
- **GPA:**
  - a repeat (D then B uses the B only);
  - transfer CR excluded;
  - P and W excluded;
  - an F that counts as 0;
  - a missing-units attempt gives `unknown`;
  - no graded courses gives `null`.
- **Breadth:**
  - a W+B-Hum course counts for W and for one bucket only (I2);
  - a 2-unit B-Soc course forces a third slot;
  - a course below C- earns no B;
  - the additional bucket takes a B-designated course left over after the designated buckets fill.
- **Unknowns:** a course with no data; a BUS 49x topics course needed by `finance-electives`; the `gpa-program` row; an out-of-scope row stays `not_applicable`.
- **Demo student fixture** (fictional, `tests/engine/fixtures/demo-student.ts`):
  - Finance, admitted 2024-fall, about 60 completed units over 2024-fall to 2026-summer, 4 courses in progress in 2026-fall.
  - Includes one repeat, one transfer CR course, a P-graded BUS 203, and a W course that is also B-Hum.
  - The expected status, `have`/`need` and used courses for every in-scope row are written by hand from requirements.json **before** the engine runs (`tests/engine/fixtures/demo-student.expected.ts`, with a comment per row showing the arithmetic). Phase 1 prints the audit for review.

**Phase 1 layout:**

- `src/engine/audit/` holds `types.ts`, `courses.ts` (attempts, repeats, units), `eligibility.ts` (filters), `matching.ts` (Hopcroft-Karp), `breadth.ts`, `gpa.ts`, `rules.ts` (one evaluator per rule), and `audit.ts` (tiers, pools, summary).
- The schemas come from `src/lib/data`, which the engine may import (no I/O).
