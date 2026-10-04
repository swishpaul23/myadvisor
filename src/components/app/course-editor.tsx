"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { termLabel } from "@/lib/app/terms";
import { GRADES, MAX_COURSES, type RecordCourse } from "@/lib/app/types";
import { cn } from "@/lib/utils";
import {
  BUTTON_GHOST,
  BUTTON_SECONDARY,
  FIELD,
  FIELD_ERROR,
  HINT,
} from "./styles";

type Row = {
  key: number;
  code: string;
  term: string;
  status: RecordCourse["status"];
  grade: string;
  institution: RecordCourse["institution"];
  units: number | null;
};

let nextKey = 0;
const toRow = (c: RecordCourse): Row => ({
  key: nextKey++,
  code: c.code,
  term: c.term,
  status: c.status,
  grade: c.grade ?? "",
  institution: c.institution,
  units: c.units,
});

/** What the hidden input posts: the rows as the server's course schema expects them. */
const toPayload = (rows: Row[]) =>
  JSON.stringify(
    rows.map((r) => ({
      code: r.code,
      term: r.term,
      status: r.status,
      grade: r.status === "completed" ? r.grade || null : null,
      institution: r.institution,
      units: r.units,
    })),
  );

const SELECT = cn(FIELD, "appearance-auto pr-2");
// Labels sit above each field on phones; on wider screens the header row names columns.
const CELL_LABEL = "text-[12px] text-ink-muted md:sr-only";

/**
 * Editable course list. Posts its rows as JSON in a hidden input named `name`.
 * `errors` uses the server's keys ("courses.2.grade"); `flags` marks rows to double-check;
 * `notes` are neutral (e.g. elective credit) and need no fix.
 */
export function CourseEditor({
  initial,
  termOptions,
  errors = {},
  flags = {},
  notes = {},
  name = "courses",
}: {
  initial: RecordCourse[];
  termOptions: string[];
  errors?: Record<string, string>;
  flags?: Record<number, string>;
  notes?: Record<number, string>;
  name?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map(toRow));
  const defaultTerm = termOptions[0] ?? "";
  const update = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const atCap = rows.length >= MAX_COURSES;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={toPayload(rows)} />
      {rows.length === 0 ? (
        <p className={cn(HINT, "rounded-[10px] bg-surface-subtle px-3.5 py-3")}>
          No courses yet. Add each course you&apos;ve completed or are taking
          now.
        </p>
      ) : (
        <div className="flex flex-col">
          <div
            aria-hidden="true"
            className="grid grid-cols-[1.2fr_1.2fr_1.1fr_0.8fr_0.9fr_auto] gap-2 px-1 pb-1.5 text-[12px] text-ink-muted max-md:hidden"
          >
            <span>Course</span>
            <span>Term</span>
            <span>Status</span>
            <span>Grade</span>
            <span>Taken at</span>
            <span className="w-[68px]" />
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const err = (field: string) => errors[`${name}.${i}.${field}`];
              const id = (field: string) => `${name}-${row.key}-${field}`;
              const rowErrors = [
                "code",
                "term",
                "status",
                "grade",
                "institution",
              ]
                .map(err)
                .filter(Boolean);
              return (
                <li
                  key={row.key}
                  className={cn(
                    "rounded-[10px] border border-transparent p-1",
                    flags[i] && "border-brand/30 bg-brand-wash",
                    rowErrors.length > 0 && "border-brand/30",
                  )}
                >
                  <fieldset className="grid grid-cols-[1.2fr_1.2fr_1.1fr_0.8fr_0.9fr_auto] items-end gap-2 max-md:grid-cols-2">
                    <legend className="sr-only">
                      Course {i + 1}
                      {row.code ? `: ${row.code}` : ""}
                    </legend>
                    <label className="flex flex-col gap-1">
                      <span className={CELL_LABEL}>Course code</span>
                      <Input
                        id={id("code")}
                        value={row.code}
                        onChange={(e) =>
                          update(row.key, { code: e.target.value })
                        }
                        placeholder="BUS 217W"
                        autoCapitalize="characters"
                        spellCheck={false}
                        required
                        aria-invalid={Boolean(err("code"))}
                        className={FIELD}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={CELL_LABEL}>Term</span>
                      <select
                        value={row.term}
                        onChange={(e) =>
                          update(row.key, { term: e.target.value })
                        }
                        required
                        aria-invalid={Boolean(err("term"))}
                        className={SELECT}
                      >
                        {!row.term && (
                          <option value="" disabled>
                            Pick a term
                          </option>
                        )}
                        {!termOptions.includes(row.term) && row.term && (
                          <option value={row.term}>
                            {termLabel(row.term)}
                          </option>
                        )}
                        {termOptions.map((t) => (
                          <option key={t} value={t}>
                            {termLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={CELL_LABEL}>Status</span>
                      <select
                        value={row.status}
                        onChange={(e) => {
                          const status = e.target.value as Row["status"];
                          update(row.key, {
                            status,
                            grade: status === "in_progress" ? "" : row.grade,
                          });
                        }}
                        className={SELECT}
                      >
                        <option value="completed">Completed</option>
                        <option value="in_progress">In progress</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={CELL_LABEL}>Grade</span>
                      <select
                        value={row.grade}
                        onChange={(e) =>
                          update(row.key, { grade: e.target.value })
                        }
                        disabled={row.status === "in_progress"}
                        required={row.status === "completed"}
                        aria-invalid={Boolean(err("grade"))}
                        className={cn(
                          SELECT,
                          "disabled:bg-surface-subtle disabled:text-ink-muted",
                        )}
                      >
                        <option value="">
                          {row.status === "in_progress" ? "—" : "Pick"}
                        </option>
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={CELL_LABEL}>Taken at</span>
                      <select
                        value={row.institution}
                        onChange={(e) =>
                          update(row.key, {
                            institution: e.target.value as Row["institution"],
                          })
                        }
                        className={SELECT}
                      >
                        <option value="SFU">SFU</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((all) => all.filter((r) => r.key !== row.key))
                      }
                      className={cn(
                        BUTTON_GHOST,
                        "w-[68px] max-md:col-span-2 max-md:w-full",
                      )}
                    >
                      Remove<span className="sr-only"> course {i + 1}</span>
                    </button>
                  </fieldset>
                  {(flags[i] || notes[i] || rowErrors.length > 0) && (
                    <div className="mt-1.5 flex flex-col gap-0.5 px-1">
                      {notes[i] && !flags[i] && (
                        <p className={HINT}>{notes[i]}</p>
                      )}
                      {flags[i] && (
                        <p className="text-[12px] text-brand">{flags[i]}</p>
                      )}
                      {rowErrors.map((m) => (
                        <p key={m} className={FIELD_ERROR}>
                          {m}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={atCap}
          onClick={() =>
            setRows((all) => [
              ...all,
              {
                key: nextKey++,
                code: "",
                term: defaultTerm,
                status: "completed",
                grade: "",
                institution: "SFU",
                units: null,
              },
            ])
          }
          className={BUTTON_SECONDARY}
        >
          Add a course
        </button>
        <span className={HINT} aria-live="polite">
          {atCap
            ? `That's the most a record can hold (${MAX_COURSES} courses).`
            : `${rows.length} ${rows.length === 1 ? "course" : "courses"}`}
        </span>
      </div>
    </div>
  );
}
