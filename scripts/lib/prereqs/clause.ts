import type { PrereqNode } from "@/lib/data/prereqs";
import { lex, type Token } from "./lexer";
import {
  applyGrade,
  course,
  group,
  hasUnits,
  markConcurrent,
  unknown,
} from "./nodes";

// Parses one requirement clause (text between top-level semicolons) into a node.
// Structure is built only where the text states it: commas with a clear final "and"/"or",
// "all/both with" qualifiers, parentheses, "one of", "both/all of", "including".
// Anything ambiguous (e.g. "A or B and C" with no commas or parentheses) throws, and the
// whole clause becomes one unknown node. Never guess.

class Ambiguous extends Error {}

type Conn = "and" | "or";
/** `words`: the segment had plain words, so `node` is one unknown holding its text. */
type Seq = {
  node: PrereqNode;
  conns: Set<Conn>;
  atoms: number;
  words?: boolean;
};

function fullyGraded(node: PrereqNode): boolean {
  if (node.type === "course") return node.minGrade !== null;
  if (node.type === "all" || node.type === "any")
    return node.of.every(fullyGraded);
  return true;
}

function hasUngradedCourse(node: PrereqNode): boolean {
  if (node.type === "course") return node.minGrade === null;
  if (node.type === "all" || node.type === "any")
    return node.of.some(hasUngradedCourse);
  return false;
}

/**
 * "MATH 155 or 158 with a grade of B": a grade on only the last course, none on the
 * earlier ones. Literal reading leaves MATH 155 without a minimum; the intent is unclear.
 */
function trailingOnlyGrade(nodes: PrereqNode[]): boolean {
  const last = nodes[nodes.length - 1];
  if (!last || nodes.length < 2) return false;
  const lastHasCourse = last.type !== "units" && last.type !== "unknown";
  return (
    lastHasCourse &&
    fullyGraded(last) &&
    nodes.slice(0, -1).some(hasUngradedCourse)
  );
}

function containsUnknown(node: PrereqNode): boolean {
  if (node.type === "unknown") return true;
  if (node.type === "all" || node.type === "any")
    return node.of.some(containsUnknown);
  return false;
}

const isCode = (t: Token) => t.kind === "course";
const isStructural = (t: Token) =>
  t.kind === "course" || t.kind === "units" || t.kind === "grade";

/** Index of the rp matching the lp at `open`. */
function matchParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i]!.kind === "lp") depth++;
    if (tokens[i]!.kind === "rp" && --depth === 0) return i;
  }
  throw new Ambiguous("unbalanced parentheses");
}

/** Splits at depth-0 tokens of `kind`. */
function splitTop(tokens: Token[], kind: Token["kind"]): Token[][] {
  const out: Token[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === "lp") depth++;
    if (t.kind === "rp") depth--;
    if (depth === 0 && t.kind === kind) out.push([]);
    else out[out.length - 1]!.push(t);
  }
  return out;
}

const slice = (text: string, tokens: Token[]) =>
  tokens.length === 0
    ? ""
    : text.slice(tokens[0]!.start, tokens[tokens.length - 1]!.end);

function hasTopWord(tokens: Token[]): boolean {
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === "lp") depth++;
    if (t.kind === "rp") depth--;
    if (depth === 0 && t.kind === "word") return true;
  }
  return false;
}

// ---------- atoms and sequences (no top-level commas) ----------

function parseAtom(
  tokens: Token[],
  pos: number,
  text: string,
): { node: PrereqNode; next: number } {
  const t = tokens[pos];
  if (!t) throw new Ambiguous("missing atom");
  let node: PrereqNode;
  let next = pos + 1;

  if (t.kind === "coreq") {
    const inner = parseAtom(tokens, pos + 1, text);
    markConcurrent(inner.node);
    return inner;
  } else if (t.kind === "course") {
    node = group(
      "any",
      t.codes.map((c) => course(c)),
    );
    // "BUS 330 (or BUS 329)", "BUS 311 (or BUS 254 and BUS 312)": an alternative.
    if (tokens[next]?.kind === "lp" && tokens[next + 1]?.kind === "or") {
      const close = matchParen(tokens, next);
      const inner = tokens.slice(next + 2, close);
      if (inner.some((x) => x.kind === "word"))
        throw new Ambiguous("words in alternative");
      node = group("any", [node, parseSeq(inner, text).node]);
      next = close + 1;
    }
  } else if (t.kind === "units") {
    node = {
      type: "units",
      min: t.min,
      ...(t.level ? { level: t.level } : {}),
      ...(t.subject ? { subject: t.subject } : {}),
    };
  } else if (t.kind === "lp") {
    const close = matchParen(tokens, pos);
    const inner = tokens.slice(pos + 1, close);
    node = inner.some((x) => x.kind === "word")
      ? unknown(text.slice(t.start, tokens[close]!.end))
      : parseList(inner, text);
    next = close + 1;
  } else {
    throw new Ambiguous(`unexpected ${t.kind}`);
  }

  // A grade right after an atom (no comma) applies to that atom only.
  const g = tokens[next];
  if (g?.kind === "grade") {
    if (g.qual !== null) throw new Ambiguous("qualified grade without comma");
    if (hasUnits(node)) throw new Ambiguous("grade on units");
    applyGrade(node, g.grade);
    next++;
  }
  return { node, next };
}

function parseSeq(tokens: Token[], text: string): Seq {
  if (tokens.length === 0) throw new Ambiguous("empty");
  if (hasTopWord(tokens)) {
    return {
      node: unknown(slice(text, tokens)),
      conns: new Set(),
      atoms: 1,
      words: true,
    };
  }

  // "N units including X or Y": including binds loosest (X or Y is what is included).
  const inc = splitTop(tokens, "including");
  if (inc.length > 1) {
    return {
      node: group(
        "all",
        inc.map((part) => parseSeq(part, text).node),
      ),
      conns: new Set(["and"]),
      atoms: inc.length,
    };
  }

  const first = tokens[0]!;
  if (first.kind === "oneOf" || first.kind === "allOf") {
    const rest = parseSeq(tokens.slice(1), text);
    const forbidden: Conn = first.kind === "oneOf" ? "and" : "or";
    if (rest.conns.has(forbidden)) throw new Ambiguous("mixed one-of/all-of");
    if (rest.node.type === (first.kind === "oneOf" ? "all" : "any")) {
      throw new Ambiguous("one-of over a conjunction");
    }
    return { node: rest.node, conns: new Set(), atoms: 1 };
  }

  const nodes: PrereqNode[] = [];
  const conns = new Set<Conn>();
  let pos = 0;
  while (pos < tokens.length) {
    const tok = tokens[pos]!;
    if (tok.kind === "oneOf" || tok.kind === "allOf") {
      nodes.push(parseSeq(tokens.slice(pos), text).node); // consumes the rest
      break;
    }
    const atom = parseAtom(tokens, pos, text);
    nodes.push(atom.node);
    pos = atom.next;
    if (pos >= tokens.length) break;
    const conn = tokens[pos]!;
    if (conn.kind !== "and" && conn.kind !== "or") {
      throw new Ambiguous(`expected and/or, got ${conn.kind}`);
    }
    conns.add(conn.kind);
    pos++;
    if (pos >= tokens.length) throw new Ambiguous("dangling connective");
  }
  if (conns.has("and") && conns.has("or")) throw new Ambiguous("mixed and/or");
  if (trailingOnlyGrade(nodes))
    throw new Ambiguous("grade on last course only");
  return {
    node: group(conns.has("or") ? "any" : "all", nodes),
    conns,
    atoms: nodes.length,
  };
}

// ---------- comma lists ----------

type Item = { conn: Conn | null; seq: Seq };

function parseList(tokens: Token[], text: string): PrereqNode {
  const segments = splitTop(tokens, "comma");
  const items: Item[] = [];
  let gradeFrom = 0; // items from here on get the next group grade
  let qualified = false;
  let lastGradeAt = -1;

  for (let s = 0; s < segments.length; s++) {
    let seg = segments[s]!;
    let conn: Conn | null = null;
    const lead = seg[0];
    if (lead?.kind === "and" || lead?.kind === "including") conn = "and";
    if (lead?.kind === "or") conn = "or";
    if (conn) seg = seg.slice(1);
    if (seg.length === 0) throw new Ambiguous("empty segment");

    // ", with a minimum grade of C-" / ", all with ..." / ", both with ... and 45 units"
    const head = seg[0]!;
    if (head.kind === "grade") {
      if (conn) throw new Ambiguous("connective before grade");
      for (const item of items.slice(gradeFrom)) {
        if (hasUnits(item.seq.node)) throw new Ambiguous("grade over units");
        // The grade would be lost from an unknown's text; keep the whole clause instead.
        if (containsUnknown(item.seq.node))
          throw new Ambiguous("grade over unknown");
        applyGrade(item.seq.node, head.grade);
      }
      if (head.qual) qualified = true;
      gradeFrom = items.length;
      lastGradeAt = items.length;
      const rest = seg.slice(1);
      if (rest.length > 0) {
        if (rest[0]!.kind !== "and" && rest[0]!.kind !== "or") {
          throw new Ambiguous("text after grade");
        }
        segments.splice(s + 1, 0, rest);
      }
      continue;
    }

    // Segment-level "one of A, B, or C" / "all of: A, B, and C" spanning commas.
    if (head.kind === "oneOf" || head.kind === "allOf") {
      const allowed: (Conn | null)[] =
        head.kind === "oneOf" ? [null, "or"] : [null, "and"];
      const parts: Seq[] = [parseSeq(seg.slice(1), text)];
      while (s + 1 < segments.length) {
        const nextSeg = segments[s + 1]!;
        const k = nextSeg[0]?.kind;
        const nextConn: Conn | null =
          k === "and" ? "and" : k === "or" ? "or" : null;
        const body = nextConn ? nextSeg.slice(1) : nextSeg;
        const bodyHead = body[0]?.kind;
        if (
          !allowed.includes(nextConn) ||
          bodyHead === "grade" ||
          bodyHead === "oneOf" ||
          bodyHead === "allOf"
        ) {
          break;
        }
        parts.push(parseSeq(body, text));
        s++;
      }
      const forbidden: Conn = head.kind === "oneOf" ? "and" : "or";
      if (parts.some((p) => p.conns.has(forbidden)))
        throw new Ambiguous("mixed group");
      if (trailingOnlyGrade(parts.map((p) => p.node)))
        throw new Ambiguous("grade on last only");
      items.push({
        conn,
        seq: {
          node: group(
            head.kind === "oneOf" ? "any" : "all",
            parts.map((p) => p.node),
          ),
          conns: new Set(),
          atoms: 1,
        },
      });
      continue;
    }

    // "ECON 201 and one of ECON 233, STAT 270, or STAT 271": a mid-segment "one of" whose
    // list continues across the following commas.
    const inner = seg.findIndex((t, i) => i > 0 && t.kind === "oneOf");
    if (inner > 0 && !hasTopWord(seg)) {
      const joiner = seg[inner - 1]!;
      if (joiner.kind !== "and" && joiner.kind !== "or")
        throw new Ambiguous("one-of without connective");
      const prefix = parseSeq(seg.slice(0, inner - 1), text);
      if (prefix.conns.size > 0 && !prefix.conns.has(joiner.kind))
        throw new Ambiguous("mixed prefix");
      const parts: Seq[] = [parseSeq(seg.slice(inner + 1), text)];
      while (s + 1 < segments.length) {
        const nextSeg = segments[s + 1]!;
        const k = nextSeg[0]?.kind;
        if (k === "and") break;
        const body = k === "or" ? nextSeg.slice(1) : nextSeg;
        const bodyHead = body[0]?.kind;
        if (
          bodyHead === "grade" ||
          bodyHead === "oneOf" ||
          bodyHead === "allOf"
        )
          break;
        parts.push(parseSeq(body, text));
        s++;
      }
      if (parts.some((p) => p.conns.has("and") || p.words))
        throw new Ambiguous("mixed one-of");
      if (trailingOnlyGrade(parts.map((p) => p.node)))
        throw new Ambiguous("grade on last only");
      const choice = group(
        "any",
        parts.map((p) => p.node),
      );
      items.push({
        conn,
        seq: {
          node: group(joiner.kind === "and" ? "all" : "any", [
            prefix.node,
            choice,
          ]),
          conns: new Set([joiner.kind]),
          atoms: 2,
        },
      });
      continue;
    }

    items.push({ conn, seq: parseSeq(seg, text) });
  }

  if (items.length === 0) throw new Ambiguous("no items");
  // Two or more segments of plain words: the commas are probably inside one phrase
  // ("majors, joint majors, or second degree students ..."); don't split it.
  if (items.filter((i) => i.seq.words).length >= 2)
    throw new Ambiguous("words across commas");
  if (items.length === 1) return items[0]!.seq.node;

  const listConns = new Set(
    items.slice(1).flatMap((i) => (i.conn ? [i.conn] : [])),
  );
  if (listConns.size > 1) throw new Ambiguous("mixed list connectives");

  let type: "all" | "any";
  if (listConns.has("and")) type = "all";
  else if (listConns.has("or")) type = "any";
  else if (qualified) type = "all";
  else if (items.every((i) => !i.seq.conns.has("or"))) type = "all";
  else {
    // "A, B or C": only the last item has an "or", the others are single atoms.
    const last = items[items.length - 1]!;
    const earlierSimple = items
      .slice(0, -1)
      .every((i) => i.seq.atoms === 1 && i.seq.conns.size === 0);
    if (earlierSimple && !last.seq.conns.has("and")) type = "any";
    else throw new Ambiguous("unclear list");
  }

  if (trailingOnlyGrade(items.map((i) => i.seq.node)))
    throw new Ambiguous("grade on last only");
  if (type === "any") {
    if (items.some((i) => i.seq.conns.has("and")))
      throw new Ambiguous("and inside or-list");
    // A group grade in the middle of an or-list ("A, B, with C-, or D with A-") is unclear.
    if (lastGradeAt !== -1 && lastGradeAt < items.length)
      throw new Ambiguous("grade mid or-list");
  }
  return group(
    type,
    items.map((i) => i.seq.node),
  );
}

// ---------- clause entry point ----------

const PERMISSION_TAIL =
  /^(.*\S)\s*,?\s+or\s+((?:with\s+)?(?:the\s+)?(?:special\s+|written\s+)?(?:permission|approval)\b.*)$/;
const PERMISSION_AND_TAIL =
  /^(.*\S)\s*,?\s+and\s+((?:the\s+)?(?:written\s+)?(?:special\s+)?permission\b.*)$/;
const PERMISSION_HEAD =
  /^((?:[Ww]ritten\s+)?[Pp]ermission\s+of\s+[^,;]*?)\s+and\s+(.+)$/;
const CODE = /\b[A-Z]{2,5} \d{3}/;

/** One clause -> node, or null if empty. Unclear clauses become a single unknown node. */
export function parseClause(raw: string): PrereqNode | null {
  const text = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.;,]+$/, "");
  if (!text) return null;

  // Nothing we can map at all (admission rules, "To be determined ..."): one unknown.
  const all = lex(text);
  if (!all.some((t) => t.kind === "course" || t.kind === "units"))
    return unknown(text);

  // "... or permission of the instructor": the permission is an alternative to everything
  // before it (the calendar's convention); kept verbatim as unknown.
  const tail = PERMISSION_TAIL.exec(text);
  if (tail && !CODE.test(tail[2]!)) {
    return group("any", [
      parseClause(tail[1]!) ?? unknown(tail[1]!),
      unknown(tail[2]!),
    ]);
  }
  // "MATH 336 and permission of the co-op co-ordinator": the rest plus permission.
  const andTail = PERMISSION_AND_TAIL.exec(text);
  if (andTail && !CODE.test(andTail[2]!)) {
    return group("all", [
      parseClause(andTail[1]!) ?? unknown(andTail[1]!),
      unknown(andTail[2]!),
    ]);
  }
  // "Permission of the faculty and BUS 360W ...": permission plus the rest.
  const head = PERMISSION_HEAD.exec(text);
  if (
    head &&
    !CODE.test(head[1]!) &&
    (CODE.test(head[2]!) || /\bunits\b/.test(head[2]!))
  ) {
    return group("all", [
      unknown(head[1]!),
      parseClause(head[2]!) ?? unknown(head[2]!),
    ]);
  }

  const tokens = all;
  try {
    const alt = wordAlternative(tokens, text);
    if (alt) return alt;
    return parseList(tokens, text);
  } catch (e) {
    if (e instanceof Ambiguous) return unknown(text);
    throw e;
  }
}

/**
 * "STAT 336 or Job Practicum I from another department", "Enrollment in ... program, or
 * STAT 270 with ...": an "or" between one plain side and one side that is only words.
 * Only when the other side is a single atom or fully parseable without words.
 */
function wordAlternative(tokens: Token[], text: string): PrereqNode | null {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "lp") depth++;
    if (t.kind === "rp") depth--;
    if (depth !== 0 || t.kind !== "or") continue;
    const left = tokens
      .slice(0, i)
      .filter((x, j, arr) => !(j === arr.length - 1 && x.kind === "comma"));
    const right = tokens.slice(i + 1);
    if (left.length === 0 || right.length === 0) continue;
    const wordsOnly = (side: Token[]) =>
      side.some((x) => x.kind === "word") && !side.some(isStructural);
    const plain = (side: Token[]) => !side.some((x) => x.kind === "word");

    if (
      wordsOnly(right) &&
      plain(left) &&
      !left.some((x) => x.kind === "comma")
    ) {
      const l = parseSeq(left, text);
      if (l.atoms === 1)
        return group("any", [l.node, unknown(slice(text, right))]);
    }
    if (wordsOnly(left) && plain(right) && right.some(isCode)) {
      return group("any", [unknown(slice(text, left)), parseList(right, text)]);
    }
  }
  return null;
}
