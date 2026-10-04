"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Briefcase,
  GripVertical,
  Link2,
  ListChecks,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import {
  checkPlan,
  discardSavedPlan,
  savePlan,
} from "@/app/app/(shell)/plan/actions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  moveItem,
  sameLayout,
  termUnits,
  type BoardItem,
  type BoardTerm,
} from "@/lib/app/plan-board";
import type { BoardCheck, CourseRule, RuleStatus } from "@/lib/app/plan-check";
import { termLabel } from "@/lib/app/terms";
import { cn } from "@/lib/utils";
import { FormError } from "./form-parts";
import {
  BUTTON_BRAND,
  BUTTON_GHOST,
  BUTTON_SECONDARY,
  FOCUS,
  HINT,
  PANEL_TITLE,
  TAG,
} from "./styles";

// My plan's semester cards. The student drags courses between terms (or uses "Move to…");
// every move is checked by the plan validator on the server and rule breaks are flagged on
// the row, never rejected. Save keeps the layout in the encrypted cookies.

const STATUS_TEXT: Record<RuleStatus, string> = {
  met: "Met by this term.",
  not_met: "Not met by this term.",
  cannot_check: "Can't be checked automatically. Check with an advisor.",
  not_checked: "Not checked while the course is in a co-op term.",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function RuleIcon({
  kind,
  rule,
  code,
}: {
  kind: "Prerequisites" | "Corequisites";
  rule: CourseRule;
  code: string;
}) {
  const Icon = kind === "Prerequisites" ? ListChecks : Link2;
  const text = `${kind} for ${code}: ${rule.text || "see the calendar."} ${STATUS_TEXT[rule.status]}`;
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={text}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-[6px] hover:bg-surface-subtle",
          rule.status === "not_met" ? "text-brand" : "text-ink-muted",
          FOCUS,
        )}
      >
        <Icon size={14} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent className="flex max-w-[280px] flex-col items-start gap-1 text-left leading-[1.45]">
        <span className="font-medium">{kind}</span>
        <span>{rule.text || "See the calendar."}</span>
        <span className="opacity-80">{STATUS_TEXT[rule.status]}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function CourseRow({
  item,
  term,
  terms,
  flags,
  rules,
  onMove,
}: {
  item: BoardItem;
  term: BoardTerm;
  terms: BoardTerm[];
  flags: string[];
  rules: BoardCheck["rules"][string] | undefined;
  onMove: (itemId: string, toTermId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, data: { label: item.label } });
  const flagged = flags.length > 0;
  const name = item.code ?? item.label;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex gap-1.5 border-b border-line-soft py-2 last:border-b-0",
        flagged &&
          "-mx-2 rounded-[8px] border-l-2 border-l-brand bg-brand-wash px-2",
        isDragging && "relative z-10 rounded-[8px] bg-white shadow-md",
      )}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${name}`}
        className={cn(
          "mt-0.5 inline-flex h-6 w-5 flex-none cursor-grab touch-none items-center justify-center rounded-[6px] text-ink-muted hover:bg-surface-subtle hover:text-ink active:cursor-grabbing",
          FOCUS,
        )}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="leading-[1.35]">
          <span className={item.code ? "font-semibold" : "font-medium"}>
            {item.label}
          </span>
          {item.title && <span className="text-ink-body"> · {item.title}</span>}
        </p>
        <p
          className={cn(
            "text-[12px] leading-[1.4]",
            item.closesGap ? "text-brand" : "text-ink-muted",
          )}
        >
          {item.note}
        </p>
        {flags.map((f) => (
          <p
            key={f}
            className="mt-1 flex gap-1.5 text-[12px] leading-[1.4] font-medium text-brand"
          >
            <TriangleAlert
              size={13}
              aria-hidden="true"
              className="mt-px flex-none"
            />
            <span>
              <span className="sr-only">Problem: </span>
              {f}
            </span>
          </p>
        ))}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {item.code && rules?.prereq && (
            <RuleIcon
              kind="Prerequisites"
              rule={rules.prereq}
              code={item.code}
            />
          )}
          {item.code && rules?.coreq && (
            <RuleIcon kind="Corequisites" rule={rules.coreq} code={item.code} />
          )}
          <label className="sr-only" htmlFor={`move-${item.id}`}>
            Move {name} to another term
          </label>
          <select
            id={`move-${item.id}`}
            value=""
            onChange={(e) => {
              if (e.target.value) onMove(item.id, e.target.value);
            }}
            className={cn(
              "h-6 max-w-[9.5rem] rounded-[6px] border border-line-soft bg-white px-1.5 text-[12px] text-ink-body hover:border-line",
              FOCUS,
            )}
          >
            <option value="">Move to…</option>
            {terms
              .filter((t) => t.termId !== term.termId)
              .map((t) => (
                <option key={t.termId} value={t.termId}>
                  {termLabel(t.termId)}
                  {t.kind === "coop" ? " (co-op)" : ""}
                </option>
              ))}
          </select>
        </div>
      </div>
      <span className="mt-0.5 font-mono text-[11px] text-ink-body">
        {item.units ?? "?"}
      </span>
    </li>
  );
}

function TermCard({
  term,
  title,
  terms,
  items,
  check,
  onMove,
}: {
  term: BoardTerm;
  title: string;
  terms: BoardTerm[];
  items: Record<string, BoardItem>;
  check: BoardCheck;
  onMove: (itemId: string, toTermId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: term.termId });
  const units = termUnits(term, items);
  const flagged = term.itemIds.filter(
    (id) => (check.flags[id]?.length ?? 0) > 0,
  ).length;
  const termProblems = check.termProblems[term.termId] ?? [];
  const problems = flagged + termProblems.length;
  const coop = term.kind === "coop";
  return (
    <li
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        "flex flex-col rounded-[12px] border border-line-soft p-4 text-[13px] shadow-[0_1px_2px_rgba(20,20,20,0.04)] backdrop-blur-md transition-colors motion-reduce:transition-none",
        coop ? "bg-surface-subtle/80" : "bg-white/80",
        isOver && "border-ink/40 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={PANEL_TITLE}>{title}</h3>
        {coop ? (
          <span className={TAG}>Co-op</span>
        ) : (
          <span className="mt-0.5 font-mono text-[11px] whitespace-nowrap text-ink-body">
            {units === null ? "? units" : plural(units, "unit")}
          </span>
        )}
      </div>
      {problems > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-brand">
          <TriangleAlert size={13} aria-hidden="true" />
          {plural(problems, "problem")}
        </p>
      )}
      {termProblems.map((p) => (
        <p key={p} className="mt-1 text-[12px] text-brand">
          {p}
        </p>
      ))}
      {(check.termNotes[term.termId] ?? []).map((n) => (
        <p key={n} className="mt-1 text-[12px] text-ink-muted">
          {n}
        </p>
      ))}
      {coop && (
        <p className="mt-2 flex items-center gap-2 text-ink-muted">
          <Briefcase size={14} aria-hidden="true" />
          Co-op work term. No courses planned.
        </p>
      )}
      {term.itemIds.length > 0 ? (
        <ul className="mt-2 flex flex-col">
          {term.itemIds.map((id) => {
            const item = items[id];
            return item ? (
              <CourseRow
                key={id}
                item={item}
                term={term}
                terms={terms}
                flags={check.flags[id] ?? []}
                rules={check.rules[id]}
                onMove={onMove}
              />
            ) : null;
          })}
        </ul>
      ) : (
        !coop && (
          <p className="mt-2 rounded-[8px] border border-dashed border-line px-3 py-3 text-ink-muted">
            No courses. Drag one here.
          </p>
        )
      )}
    </li>
  );
}

/** Card titles: "Semester N – Fall 2026" for study terms, "Co-op – Summer 2027" for work terms. */
function cardTitles(terms: BoardTerm[]): Record<string, string> {
  let n = 0;
  return Object.fromEntries(
    terms.map((t) => [
      t.termId,
      t.kind === "coop"
        ? `Co-op – ${termLabel(t.termId)}`
        : `Semester ${++n} – ${termLabel(t.termId)}`,
    ]),
  );
}

export function PlanBoard({
  generated,
  initial,
  items,
  initialCheck,
  hasSaved,
  stale,
}: {
  /** The generated plan, for Reset and Regenerate. */
  generated: BoardTerm[];
  /** What to show first: the saved plan if there is one, else the generated plan. */
  initial: BoardTerm[];
  items: Record<string, BoardItem>;
  initialCheck: BoardCheck;
  hasSaved: boolean;
  /** The record or plan settings changed since the plan was saved. */
  stale: boolean;
}) {
  const [terms, setTerms] = useState(initial);
  const [check, setCheck] = useState(initialCheck);
  const [saved, setSaved] = useState<BoardTerm[] | null>(
    hasSaved ? initial : null,
  );
  const [justSaved, setJustSaved] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [checking, setChecking] = useState(false);
  const [pending, startTransition] = useTransition();
  const request = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );
  const titles = cardTitles(terms);
  const nameOf = (id: string) => items[id]?.code ?? items[id]?.label ?? id;
  const dirty = !sameLayout(terms, saved ?? generated);

  /** Shows a layout and asks the validator about it; the latest request wins. */
  async function show(next: BoardTerm[], moved?: { id: string; to: string }) {
    setTerms(next);
    setJustSaved(false);
    setError(null);
    const mine = ++request.current;
    setChecking(true);
    const result = await checkPlan({ terms: next });
    if (mine !== request.current) return;
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCheck(result.data);
    if (moved) {
      const flags = result.data.flags[moved.id] ?? [];
      setAnnouncement(
        `Moved ${nameOf(moved.id)} to ${titles[moved.to] ?? termLabel(moved.to)}. ${
          flags.length > 0 ? `Problem: ${flags.join(" ")}` : "No problems."
        }`,
      );
    }
  }

  function move(itemId: string, toTermId: string) {
    const next = moveItem(terms, itemId, toTermId);
    if (next === terms) return;
    void show(next, { id: itemId, to: toTermId });
  }

  function onDragEnd(e: DragEndEvent) {
    if (e.over) move(String(e.active.id), String(e.over.id));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(String(active.id))}. Use the arrow keys to move it to another term, space to drop, escape to cancel.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(String(active.id))} is over ${titles[String(over.id)]}.`
        : `${nameOf(String(active.id))} is not over a term.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${nameOf(String(active.id))} on ${titles[String(over.id)]}.`
        : `${nameOf(String(active.id))} was not moved.`,
    onDragCancel: ({ active }) =>
      `Cancelled. ${nameOf(String(active.id))} was not moved.`,
  };

  function save() {
    startTransition(async () => {
      const result = await savePlan({ terms });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(terms);
      setJustSaved(true);
      setAnnouncement("Plan saved.");
    });
  }

  function regenerate() {
    startTransition(async () => {
      const result = await discardSavedPlan();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmRegenerate(false);
      setSaved(null);
      setAnnouncement("Plan regenerated from your record.");
      await show(generated);
    });
  }

  const total = terms.reduce(
    (n, t) =>
      n +
      t.itemIds.filter((id) => (check.flags[id]?.length ?? 0) > 0).length +
      (check.termProblems[t.termId]?.length ?? 0),
    0,
  );

  return (
    <section aria-label="Plan by term" className="flex flex-col gap-3">
      {saved && stale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-brand/30 bg-brand-wash px-3.5 py-2.5 text-[13px] text-brand"
        >
          <span>
            <span className="font-medium">Out of date.</span> Your record or
            plan settings changed since you saved this plan.
          </span>
          <button
            type="button"
            onClick={() => setConfirmRegenerate(true)}
            className={cn(BUTTON_SECONDARY, "h-8 text-[13px]")}
          >
            Regenerate from my record
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-body" aria-live="polite">
          {dirty ? (
            <span className="font-medium text-ink">Unsaved changes</span>
          ) : justSaved ? (
            <span className="font-medium text-ink">Saved</span>
          ) : saved ? (
            "Your saved plan"
          ) : (
            "Generated from your record"
          )}
          {checking
            ? " · Checking…"
            : total > 0
              ? ` · ${plural(total, "problem")}`
              : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void show(generated)}
            disabled={pending || sameLayout(terms, generated)}
            className={cn(BUTTON_GHOST, "text-[13px]")}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>
          {saved && (
            <button
              type="button"
              onClick={() => setConfirmRegenerate(true)}
              disabled={pending}
              className={cn(BUTTON_SECONDARY, "h-9 text-[13px]")}
            >
              Regenerate from my record
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || (!dirty && saved !== null)}
            className={cn(BUTTON_BRAND, "h-9 text-[13px]")}
          >
            {pending ? "Saving…" : "Save plan"}
          </button>
        </div>
      </div>

      {confirmRegenerate && (
        <div
          role="alertdialog"
          aria-label="Regenerate from my record"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-subtle px-3.5 py-3 text-[13px]"
        >
          <span>
            This discards your saved plan and your moves, and builds a new plan
            from your current record.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmRegenerate(false)}
              className={cn(BUTTON_SECONDARY, "h-8 text-[13px]")}
            >
              Keep my plan
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={pending}
              className={cn(BUTTON_BRAND, "h-8 text-[13px]")}
            >
              Discard and regenerate
            </button>
          </span>
        </div>
      )}

      <FormError message={error} />
      <p className={HINT}>
        Drag a course by its handle, or use “Move to…”. Moves that break a rule
        are allowed and flagged in red with the reason.
      </p>
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      <TooltipProvider delay={150}>
        <DndContext
          sensors={sensors}
          onDragEnd={onDragEnd}
          accessibility={{ announcements }}
        >
          <ol className="grid grid-cols-3 gap-3 rounded-[16px] bg-surface-subtle/60 p-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1 max-[640px]:p-2">
            {terms.map((t) => (
              <TermCard
                key={t.termId}
                term={t}
                title={titles[t.termId]!}
                terms={terms}
                items={items}
                check={check}
                onMove={move}
              />
            ))}
          </ol>
        </DndContext>
      </TooltipProvider>
    </section>
  );
}
