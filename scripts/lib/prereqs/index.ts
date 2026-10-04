import type { PrereqNode, PrereqRecord } from "@/lib/data/prereqs";
import { parseClause } from "./clause";
import { lex } from "./lexer";
import {
  countKnown,
  group,
  markConcurrent,
  unknown,
  unknownTexts,
  walk,
} from "./nodes";

// Sentence layer: splits prerequisite text into sentences, routes each one
// (recommendation, corequisite, concurrency note, requirement), and builds the record.
// Requirement sentences are split at top-level ";" into clauses (scripts/lib/prereqs/clause.ts).

const ADVISORY = /\b(recommended|recommendation|advised|may wish to)\b/i;
const COREQ_LEAD = /^(or\s+)?[Cc]orequisite\s*:?\s*(.*)$/;
const PREREQ_LEAD = /^Prerequisites?\s*:\s*(.*)$/;
const OR_LEAD = /^Or\s+(.*)$/;
const CONCURRENCY =
  /^(.+?)\s+may\s+be\s+taken\s+(?:(?:prior\s+to\s+or\s+)?concurrently|as\s+a\s+corequisite)(?:\s+with\s+[A-Z]{2,5}\s+\d{3}[A-Z]?)?$/;
const PAREN_ADVISORY = /\s*\(([^()]*\brecommended\b[^()]*)\)/gi;

/** Sentences, trimmed, without the final period. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=\.)\s+(?=[A-Z(])/)
    .map((s) => s.trim().replace(/\.$/, "").trim())
    .filter((s) => s.length > 0);
}

/** Top-level ";" split (ignores semicolons inside parentheses). */
export function splitClauses(sentence: string): string[] {
  const out = [""];
  let depth = 0;
  for (const ch of sentence) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) out.push("");
    else out[out.length - 1] += ch;
  }
  return out.map((c) => c.trim()).filter((c) => c.length > 0);
}

/** Clauses joined by "and"; a clause starting with "or"/"OR" starts an alternative. */
export function parseRequirement(sentence: string): PrereqNode | null {
  // ", OR to ..." inside a sentence that also has semicolons (BUS 360W): the OR may span
  // the whole sentence or one clause; the text doesn't say which.
  if (sentence.includes(";") && /,\s+OR\s/.test(sentence))
    return unknown(sentence);

  const alternatives: PrereqNode[][] = [[]];
  for (let clause of splitClauses(sentence)) {
    const orLead = /^(?:OR|or)\b\s*/.exec(clause);
    if (orLead) {
      alternatives.push([]);
      clause = clause.slice(orLead[0].length);
    } else if (alternatives.length > 1) {
      // "A; or B; C" (MATH 260): C may belong to the B alternative or to both.
      return unknown(sentence);
    }
    clause = clause.replace(/^and\b\s*/, "");
    const node = parseClause(clause);
    if (node) alternatives[alternatives.length - 1]!.push(node);
  }
  const groups = alternatives
    .filter((a) => a.length > 0)
    .map((a) => group("all", a));
  if (groups.length === 0) return null;
  return group("any", groups);
}

/** Course codes in a plain list like "MATH 150, MATH 151, or 157"; null if anything else. */
function codeList(text: string): string[] | null {
  const tokens = lex(text);
  if (tokens.some((t) => !["course", "and", "or", "comma"].includes(t.kind)))
    return null;
  const codes = tokens.flatMap((t) =>
    t.kind === "course" ? t.codes.slice(0, 1) : [],
  );
  return codes.length > 0 ? codes : null;
}

type Parts = {
  prereq: PrereqNode | null;
  coreq: PrereqNode[];
  advisory: string[];
  concurrency: { codes: string[]; text: string }[];
  unknowns: PrereqNode[];
};

function readText(text: string, mode: "prereq" | "coreq", parts: Parts) {
  const cleaned = text.replace(PAREN_ADVISORY, (_, inner: string) => {
    parts.advisory.push(inner.trim());
    return "";
  });

  for (const sentence of splitSentences(cleaned)) {
    if (ADVISORY.test(sentence)) {
      parts.advisory.push(sentence);
      continue;
    }

    const coreqLead = COREQ_LEAD.exec(sentence);
    if (coreqLead) {
      const body = coreqLead[2]!;
      const inner = CONCURRENCY.exec(body);
      if (inner) {
        const codes = codeList(inner[1]!);
        if (codes) parts.concurrency.push({ codes, text: sentence });
        else parts.unknowns.push(unknown(sentence));
        continue;
      }
      const node = parseRequirement(body);
      if (!node) continue;
      markConcurrent(node);
      // "or Corequisite: X" = prerequisite or corequisite: X may be taken before or with.
      if (coreqLead[1] && mode === "prereq") {
        parts.prereq = parts.prereq ? group("all", [parts.prereq, node]) : node;
      } else {
        parts.coreq.push(node);
      }
      continue;
    }

    const conc = CONCURRENCY.exec(sentence);
    if (conc) {
      const codes = codeList(conc[1]!);
      if (codes) parts.concurrency.push({ codes, text: sentence });
      else parts.unknowns.push(unknown(sentence));
      continue;
    }

    const body = PREREQ_LEAD.exec(sentence)?.[1] ?? sentence;
    const orLead = OR_LEAD.exec(body);
    const node = parseRequirement(orLead ? orLead[1]! : body);
    if (!node) continue;
    if (mode === "coreq") {
      markConcurrent(node);
      parts.coreq.push(node);
    } else if (orLead && parts.prereq) {
      parts.prereq = group("any", [parts.prereq, node]);
    } else {
      parts.prereq = parts.prereq ? group("all", [parts.prereq, node]) : node;
    }
  }
}

/** One prereqs.json record from a course's prerequisite and corequisite text. */
export function parsePrerequisites(
  code: string,
  prerequisitesText: string | null,
  corequisitesText: string | null,
): PrereqRecord {
  const parts: Parts = {
    prereq: null,
    coreq: [],
    advisory: [],
    concurrency: [],
    unknowns: [],
  };
  readText(prerequisitesText ?? "", "prereq", parts);
  readText(corequisitesText ?? "", "coreq", parts);

  let coreq = parts.coreq.length > 0 ? group("all", parts.coreq) : null;

  // "X may be taken concurrently": mark X where it appears; unknown if X isn't there.
  for (const { codes, text } of parts.concurrency) {
    const found = new Set<string>();
    for (const tree of [parts.prereq, coreq]) {
      walk(tree, (n) => {
        if (n.type === "course" && codes.includes(n.code)) found.add(n.code);
      });
    }
    if (codes.every((c) => found.has(c))) {
      for (const tree of [parts.prereq, coreq]) {
        walk(tree, (n) => {
          if (n.type === "course" && codes.includes(n.code))
            n.concurrentOk = true;
        });
      }
    } else {
      parts.unknowns.push(unknown(text));
    }
  }

  // Sentences we couldn't place are kept as unknown requirements on the prerequisite.
  let prereq = parts.prereq;
  if (parts.unknowns.length > 0) {
    prereq = group("all", [...(prereq ? [prereq] : []), ...parts.unknowns]);
  }
  coreq = coreq ?? null;

  return {
    code,
    prereq,
    coreq,
    ...statusOf(prereq, coreq),
    source: "parsed",
    raw: prerequisitesText ?? "",
    raw_coreq: corequisitesText?.trim() ? corequisitesText : null,
    advisory: parts.advisory,
  };
}

/** status and unparsed_fragments from the trees; shared with overrides. */
export function statusOf(
  prereq: PrereqNode | null,
  coreq: PrereqNode | null,
): Pick<PrereqRecord, "status" | "unparsed_fragments"> {
  const fragments = [...unknownTexts(prereq), ...unknownTexts(coreq)];
  const known = countKnown(prereq) + countKnown(coreq);
  const status: PrereqRecord["status"] =
    prereq === null && coreq === null
      ? "none"
      : fragments.length === 0
        ? "parsed"
        : known === 0
          ? "unparsed"
          : "partial";
  return { status, unparsed_fragments: fragments };
}
