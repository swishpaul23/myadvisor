// Tokenizer for one requirement clause. Every token keeps its character offsets so an
// unknown node can quote the original text exactly. Patterns are explicit; anything
// else is a "word" token, which makes its segment unknown.

import type { MIN_GRADES } from "@/lib/data/schema";

export type Grade = (typeof MIN_GRADES)[number];

type Span = { start: number; end: number };
export type Token = Span &
  (
    | { kind: "course"; codes: string[] } // "BUS 232"; "BUS (or BUEC) 232" -> both codes
    | {
        kind: "units";
        min: number;
        level?: "upper" | "lower";
        subject?: string;
      }
    | { kind: "grade"; grade: Grade; qual: "all" | "both" | null }
    | {
        kind:
          | "and"
          | "or"
          | "including"
          | "oneOf"
          | "allOf"
          | "coreq"
          | "lp"
          | "rp"
          | "comma";
      }
    | { kind: "word" }
  );

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  eighteen: 18,
  twenty: 20,
};

const WS = /\s+/y;
const UNITS =
  /(?:(?:[Aa] minimum of|[Aa]t least|[Mm]inimum of|[Mm]inimum)\s+)?(\d+|[A-Za-z]+)\s+(?:([Uu]pper|[Ll]ower)\s+division\s+)?(?:([A-Z]{2,5})\s+)?units\b(?:\s+(?:in|of)\s+([A-Z]{2,5})\b)?/y;
const COURSE_ALT =
  /([A-Z]{2,5})\s+\(or\s+([A-Z]{2,5})\)\s+(\d{3}[A-Z]?)\b(?!-)/y;
const COURSE = /([A-Z]{2,5})\s+(\d{3}[A-Z]?)\b(?!-)/y;
const BARE_NUMBER = /(\d{3}[A-Z]?)\b(?![-])(?!\s+(?:units|upper|lower)\b)/y;
const GRADE =
  /(?:(all|both)\s+)?with\s+(?:a\s+minimum\s+grade\s+of|a\s+grade\s+of\s+at\s+least|grades\s+of\s+at\s+least|a\s+grade\s+of)\s+([A-D][+-]?|P)(?![\w+-])/y;
const P_GRADE = /(?:(all|both)\s+)?with\s+a\s+(P)\s+grade\b/y;
const ONE_OF =
  /(?:[Ee]ither\s+)?(?:[Oo]ne\s+of|[Aa]t\s+least\s+one\s+of)\b\s*:?|[Ee]ither\b/y;
const ALL_OF = /(?:[Bb]oth|[Aa]ll)\s+of\b\s*:?/y;
const KEYWORDS: [RegExp, "and" | "or" | "including" | "coreq"][] = [
  [/and\b/y, "and"],
  [/(?:or|OR|Or)\b/y, "or"],
  [/including\b/y, "including"],
  [/[Cc]orequisite\b\s*:?/y, "coreq"],
];
const WORD = /[^\s,()]+/y;

function at(re: RegExp, text: string, pos: number): RegExpExecArray | null {
  re.lastIndex = pos;
  return re.exec(text);
}

export function lex(text: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let lastDept: string | null = null;

  while (pos < text.length) {
    let m = at(WS, text, pos);
    if (m) {
      pos += m[0].length;
      continue;
    }
    const start = pos;
    const ch = text[pos];
    if (ch === "(" || ch === ")" || ch === ",") {
      tokens.push({
        kind: ch === "(" ? "lp" : ch === ")" ? "rp" : "comma",
        start,
        end: pos + 1,
      });
      pos++;
      continue;
    }

    m = at(UNITS, text, pos);
    if (m) {
      const raw = m[1]!;
      const min = /^\d+$/.test(raw)
        ? Number(raw)
        : NUMBER_WORDS[raw.toLowerCase()];
      if (min !== undefined) {
        const level = m[2]?.toLowerCase() as "upper" | "lower" | undefined;
        const subject = m[3] ?? m[4];
        tokens.push({
          kind: "units",
          min,
          ...(level ? { level } : {}),
          ...(subject ? { subject } : {}),
          start,
          end: pos + m[0].length,
        });
        pos += m[0].length;
        continue;
      }
    }

    m = at(COURSE_ALT, text, pos);
    if (m) {
      lastDept = m[1]!;
      tokens.push({
        kind: "course",
        codes: [`${m[1]} ${m[3]}`, `${m[2]} ${m[3]}`],
        start,
        end: pos + m[0].length,
      });
      pos += m[0].length;
      continue;
    }

    m = at(COURSE, text, pos);
    if (m) {
      lastDept = m[1]!;
      tokens.push({
        kind: "course",
        codes: [`${m[1]} ${m[2]}`],
        start,
        end: pos + m[0].length,
      });
      pos += m[0].length;
      continue;
    }

    m = at(BARE_NUMBER, text, pos);
    if (m && lastDept) {
      tokens.push({
        kind: "course",
        codes: [`${lastDept} ${m[1]}`],
        start,
        end: pos + m[0].length,
      });
      pos += m[0].length;
      continue;
    }

    m = at(GRADE, text, pos) ?? at(P_GRADE, text, pos);
    if (m) {
      tokens.push({
        kind: "grade",
        grade: m[2] as Grade,
        qual: (m[1] as "all" | "both" | undefined) ?? null,
        start,
        end: pos + m[0].length,
      });
      pos += m[0].length;
      continue;
    }

    m = at(ONE_OF, text, pos);
    if (m) {
      tokens.push({ kind: "oneOf", start, end: pos + m[0].length });
      pos += m[0].length;
      continue;
    }
    m = at(ALL_OF, text, pos);
    if (m) {
      tokens.push({ kind: "allOf", start, end: pos + m[0].length });
      pos += m[0].length;
      continue;
    }

    let matched = false;
    for (const [re, kind] of KEYWORDS) {
      m = at(re, text, pos);
      if (m) {
        tokens.push({ kind, start, end: pos + m[0].length });
        pos += m[0].length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    m = at(WORD, text, pos)!;
    tokens.push({ kind: "word", start, end: pos + m[0].length });
    pos += m[0].length;
  }
  return tokens;
}
