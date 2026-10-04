# Prerequisite evaluator and plan validator spec (v0, for review before implementation)

Builds on `docs/engine-spec.md` (the audit) and the prerequisite data contract in CLAUDE.md. Code computes every fact; nothing is guessed.

- **Code:** `src/engine/prereqs/` (evaluator) and `src/engine/plan/` (validator). Pure TypeScript, no I/O.
- **Data:** `courses.json`, `offerings.json`, `prereqs.json`, `requirements.json` and the policy, passed in by the caller.
- **ASSUMPTION** marks anything that needs Stuart's confirmation. **OPEN** marks undecided questions, which are reported and not decided.

## 1. Inputs

```ts
type PlanTerm = { id: string; kind: "study" | "coop"; courses: string[] }; // id "2027-spring"
type Plan = { terms: PlanTerm[] };
type PlanCatalog = Catalog & {               // Catalog from src/engine/audit/types.ts
  offerings: Record<string, CourseOfferings>; // data/generated/offerings.json
  prereqs: PrereqRecord[];                    // data/generated/prereqs.json
};
type Declarations = { external?: Record<string, boolean> }; // keyed by external node text
validatePlan(student: Student, plan: Plan, catalog: PlanCatalog, declarations?: Declarations): PlanValidation
```

- `Student` is the audit's type. Its completed courses are the history. Its in-progress courses are treated as finishing **before** the first plan term.
  - **ASSUMPTION:** in-progress courses pass, at a grade no worse than any minimum asked of them (see section 2).
- Plan terms must be in strictly increasing term order, all after the student's latest completed or in-progress term. Otherwise: error `PLAN_TERM_ORDER`.
- `declarations.external` holds the student's answers to external nodes (e.g. "Pre-Calculus 12 with a grade of at least B: yes"). The setup form will provide it later. **ASSUMPTION:** answers are keyed by the node's exact `text`.

## 2. Prerequisite evaluator

```ts
type Truth = "met" | "unmet" | "unknown";
type PrereqContext = {
  completed: Map<string, string>;   // code -> best completed grade (audit's attempt choice)
  earlier: Set<string>;             // planned/in-progress courses in terms before this one
  sameTerm: Set<string>;            // other courses in the same plan term
  units: UnitLedger;                // units and course numbers available before this term
  declarations: Declarations;
};
evaluate(node, ctx, mode: "prereq" | "coreq"): { truth: Truth; needsPermission: boolean; notes: string[]; reasons: string[] }
```

**Grade comparison** uses the audit's `meetsMinimum` (`src/engine/audit/grades.ts`) unchanged:

- Letter order is A+ > A > A- > … > C- > D. A grade meets a minimum if it is at least as good.
- `P` meets a minimum only on the pass/fail courses BUS 203, 300 and 496.
- Transfer `CR` meets any minimum (**ASSUMPTION** from the audit spec), with a note.
- F, FD, N and W never meet a minimum.
- A null minimum means any grade that earns units.

**Course availability for a `course` node:**

| Source                                                               | Counts?                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Completed, grade meets `minGrade`                                    | `met`                                                                                                      |
| Completed, grade below `minGrade`, and no later attempt in `earlier` | `unmet`                                                                                                    |
| In progress, or planned in an earlier term                           | `met`, note "assumes a grade of at least X" (**ASSUMPTION**: planned courses pass with the required grade) |
| In the same term, and `concurrentOk` is true or `mode` is coreq      | `met`, note "taken concurrently"                                                                           |
| Otherwise                                                            | `unmet`                                                                                                    |

**Node rules:**

- `course`: availability as in the table.
- `all`: Kleene AND. `unmet` if any child is unmet; else `unknown` if any child is unknown; else `met`.
- `any`: Kleene OR. `met` if any child is met; else `unknown` if any child is unknown; else `unmet`.
- `units {min, level?, subject?}`: units available before this term. That is completed earned units plus in-progress and earlier planned units, each course once. Filter: `level: "upper"` means numbers 300–499, `lower` means 100–299, and `subject` is the department.
  - `met` if the sum ≥ min.
  - `unknown` if the sum is below min but courses of unknown units could close the gap.
  - Otherwise `unmet`.
- `count {n, subject, level}`: distinct courses of that subject numbered `level`..`level+99`, passed or planned earlier. `met` if ≥ n, otherwise `unmet`.
  - **ASSUMPTION:** any passing grade counts.
  - Without both subject and level: `unknown`.
- `permission`: `unmet` with `needsPermission = true` (it can be waived; never `met`).
- `restriction`: looked up by **exact text** in policy `restriction_programs` (decided).
  - Found: `met` if `student.program` matches and `admissionTerm` ≥ `admitted_from`; otherwise `unmet`.
  - Not found: `unknown`.
  - The BUS 201 and BUS 202 texts are left out of the table on purpose: they also require a Business Foundation Pathway, which the student data doesn't record.
- `unknown`: `unknown`, with the text as the reason.
- `alt_group` inside `any`: removed before evaluating, with the note "alternative route exists for <group>". If every child of an `any` is an alt_group, the result is `unknown` ("only alternative-route groups").
- `external`: `met` or `unmet` from `declarations.external[text]`. With no answer: `unknown`, reason "needs your answer: <text>".

**needsPermission** propagates when a `permission` node is the only thing keeping a subtree from `met`. Concretely, if re-evaluating with that permission node as `met` makes the result `met`, the result is `unmet` with `needsPermission = true`.

## 3. Violations

```ts
type Violation = {
  severity: "error" | "warning" | "unknown";
  code: string;
  courseCode: string | null;
  termId: string;
  message: string;
  sourceUrl: string | null;
};
```

| Code                               | Severity        | When                                                                                                       |
| ---------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `PREREQ_UNMET`                     | error           | the prereq tree is `unmet` without needsPermission                                                         |
| `PREREQ_NEEDS_PERMISSION`          | warning         | the tree is `unmet` but needsPermission (e.g. "45 units or permission of the instructor")                  |
| `PREREQ_UNKNOWN`                   | unknown         | the tree is `unknown`; message lists the reasons                                                           |
| `COREQ_UNMET` / `COREQ_UNKNOWN`    | error / unknown | the coreq tree, with same-term courses counted                                                             |
| `NOT_OFFERED_FUTURE_ONLY`          | warning         | see the offering rule                                                                                      |
| `NOT_OFFERED_RECENTLY`             | warning         | "not offered in recent history, check the schedule"                                                        |
| `NO_COURSE_DATA`                   | unknown         | the code isn't in courses.json, so prereqs, offerings and units are unknown                                |
| `DUPLICATE_IN_PLAN`                | warning         | the same code is in two plan terms, or twice in one term                                                   |
| `ALREADY_TAKEN`                    | warning         | the code is completed or in progress, unless a repeat is allowed                                           |
| `UNIT_LOAD_HIGH` / `UNIT_LOAD_LOW` | warning         | a study term's units are above the max or below the min (policy)                                           |
| `COURSES_IN_COOP_TERM`             | error           | a `coop` term lists any course                                                                             |
| `ENTRY_GPA`                        | error / unknown | a 300- or 400-level BUS course while the SFU BUS GPA is below 2.30 (error), or can't be computed (unknown) |
| `PLAN_TERM_ORDER`                  | error           | plan terms are out of order, duplicated, or not after the student's last term                              |

**Offering rule (study terms).** For a planned term `Y-season`, look at confirmed offerings in the same season in the two previous years (`Y-1`, `Y-2`), and in `Y` itself if it's confirmed. **ASSUMPTION:** "term kind" in the brief means the season (spring, summer or fall).

- Any of those terms has a section: no violation.
- Otherwise, if the course appears only under `future` (e.g. 2027-spring): `NOT_OFFERED_FUTURE_ONLY`.
- Otherwise: `NOT_OFFERED_RECENTLY`.
- Data covers 2025-spring to 2026-fall plus future 2027-spring. A plan term beyond that uses the most recent two years of that season the data has, with a note. **ASSUMPTION.**

**Repeats.** **ASSUMPTION:** a repeat is allowed, so there's no `ALREADY_TAKEN`, when the completed attempt earned no units (F, FD, N, W), or when its grade is below a minimum the student still needs (e.g. a D where a requirement asks C-). Otherwise `ALREADY_TAKEN`. OPEN-3.

**Unit load.** Add to `data/policy/sfu.json`:

- `unit_load` per season (`spring`, `summer`, `fall`), each `{ min: 9, max: 18 }`, marked **ASSUMPTION, to verify against the SFU calendar** (decided). Summer uses the same values for now. Load violations are warnings until the values are verified.
- Units come from courses.json. A course with unknown units makes the term total unknown, so no load warning is raised; the course already has `NO_COURSE_DATA`.

**Entry GPA.**

- The rule comes from `beedie-bus-gpa-entry` (2.30, `purpose entry_to_300_400_BUS`), using the audit's GPA for that row.
- The GPA comes from completed grades only. Planned courses have no grades, so the GPA is the same for every plan term.
- It applies to BUS courses numbered 300–499. **ASSUMPTION:** BUS 300 itself is included (OPEN-4).
- If the audit row is `unknown` (no graded BUS courses), the result is `ENTRY_GPA` with severity unknown.

`sourceUrl`:

- prerequisite and coreq violations: the course's calendar page, from courses.json `source_term`; **ASSUMPTION**: `https://www.sfu.ca/students/calendar/2026/fall/courses/{dept}/{number}.html`;
- offering violations: null;
- entry GPA violations: the requirement row's `source_url`.

## 4. Plan-level outputs

```ts
type PlanValidation = {
  violations: Violation[]; // sorted by term, then course, then code
  terms: { id: string; units: number | null; cumulativeUnits: number | null }[];
  graduationTerm: string | null;
  graduationBlockers: { reqId: string; status: ReqStatus }[]; // rows not met after the whole plan
  auditAfterPlan: AuditResult;
};
```

- **Running totals:**
  - `units`: the term's planned units.
  - `cumulativeUnits`: completed earned units + in-progress units + plan units so far, each course once.
  - Either is `null` if any course's units are unknown.
- **Graduation term:**
  - For each plan term t in order, run the audit with the student's courses plus every plan course through t as `planned`, and `includePlanned: true`.
  - t is the graduation term if every applicable row is `met` or `in_progress` (here, "met if the plan is completed").
  - `unknown` rows block graduation. The first such t wins; if none, `null`.
  - **ASSUMPTION:** plan violations don't change this computation. The validator reports them separately, and an `error` violation makes the graduation term "not trustworthy" (flag `graduationAssumesValidPlan: true` in the output).
- **Graduation term excluding unknown (added in Phase 1):** `graduationTermExcludingUnknown` is the first term where no row is `unmet`; `unknown` rows don't block it. Without it, `gpa-program` / `gpa-program-ud` (always `unknown`) would make every plan's graduation term null.
- **Blockers:** after the last term, every row with status `unmet` or `unknown`, from `auditAfterPlan`.
- **Violation order:** term order, then course code. Term-level violations (no course, e.g. unit load) come last within their term.

## 5. Open questions

1. "Same term kind" means season (spring/summer/fall) here. Did you mean study vs co-op?
2. Unit load min/max (9/18) are guesses. Need the SFU calendar values; also, does summer differ?
3. Repeat policy: when may a completed course be retaken without a warning?
4. Does the 2.30 entry GPA apply to BUS 300 itself, and to non-BBA courses cross-listed in BUS?
5. Restriction nodes such as "only open to approved business administration majors" appear on BUS 201, 300, 496 and more, and BUS 360W's whole prerequisite is `unknown`.
   - So every BBA plan will show `PREREQ_UNKNOWN` for these courses.
   - Should a student profile flag ("BBA major admitted 2024-fall") resolve the BBA-only restrictions? Or should prereq-overrides.csv rows be added for the core courses?
   - Default: keep them unknown.
6. Should planned courses be assumed to meet `minGrade`, or should the result be `unknown` until a grade exists? Default: assumed met, with a note.
7. Co-op terms: do they need a co-op course code (e.g. BUS 3xx co-op), or are they empty? Default: must be empty.
8. Where should the external answers live (Student or a separate argument)? Default: separate argument.

## 6. Test plan (Phase 1, tests first for each check)

- **Evaluator** (`tests/engine/prereqs.test.ts`), one test per node kind:
  - Kleene truth tables for all/any, including any(unmet, unknown) = unknown and all(met, unknown) = unknown;
  - minGrade with letters, P on BUS 203 vs others, CR, and a D followed by a planned retake;
  - concurrentOk in the same term (met) vs a non-concurrent same-term course (unmet);
  - a coreq in the same term;
  - units with level and subject;
  - count;
  - permission giving needsPermission;
  - restriction and unknown;
  - alt_group removed, plus the all-alt_group case;
  - external with and without a declaration.
- **Validator** (`tests/engine/plan.test.ts`):
  - a fully valid small plan (no violations);
  - one test per violation code;
  - a plan with a course outside the data (`NO_COURSE_DATA`, prereq unknown);
  - running totals;
  - the graduation term found and not found.
- **Golden plan** for the demo student (`tests/engine/fixtures/demo-plan.ts` and `demo-plan.expected.ts`):
  - About 5 terms from 2027-spring, covering the remaining Finance and core requirements.
  - Includes one co-op term (empty), one deliberately overloaded term, one course planned before its prerequisite, and one course whose prerequisite needs permission.
  - The expected violations, running totals and graduation term are written **by hand** from prereqs.json, offerings.json and requirements.json, and committed **before** the validator code, as with the audit. If the validator disagrees, I'll report the difference and say which side I think is wrong.
