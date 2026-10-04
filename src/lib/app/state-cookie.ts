import { decode, encode } from "next-auth/jwt";
import {
  appStateSchema,
  EMPTY_STATE,
  type AppState,
  type RecordCourse,
  type SavedPlan,
} from "./types";

// The student's app state, encrypted with Auth.js's JWE helpers (AUTH_SECRET, own salt) and
// split across cookies. Bound to the Google `sub`: a cookie written for one user reads as
// empty for another. Pure functions; store.ts does the cookie I/O.

export const STATE_COOKIE = "myadvisor.state";
const SALT = "myadvisor.app-state.v1";
/** One cookie holds about 4 KB; stay well under it. */
export const CHUNK_SIZE = 3800;
/** Request headers are capped at 16 KB in Node, and the Auth.js session cookie needs room. */
export const MAX_CHUNKS = 3;
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** The state doesn't fit in its cookies. Shown to the student as-is (plan saves reword it). */
export class StateTooLargeError extends Error {
  constructor() {
    super(
      "Your record is too large to save. Remove a few courses (older transfer courses are a good start) and try again.",
    );
    this.name = "StateTooLargeError";
  }
}

export const chunkName = (i: number) => `${STATE_COOKIE}.${i}`;

// Inside the sealed payload each course is a short tuple instead of an object with field
// names, so a full record fits the cookie budget. The app only ever sees RecordCourse.
type PackedCourse = [
  code: string,
  term: string,
  status: 0 | 1,
  grade: string | null,
  transfer: 0 | 1,
  units: number | null,
];

const pack = (c: RecordCourse): PackedCourse => [
  c.code,
  c.term,
  c.status === "completed" ? 1 : 0,
  c.grade,
  c.institution === "transfer" ? 1 : 0,
  c.units,
];

function unpack(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((t: unknown) => {
    if (!Array.isArray(t)) return t;
    const [code, term, completed, grade, transfer, units] = t as PackedCourse;
    return {
      code,
      term,
      status: completed ? "completed" : "in_progress",
      grade,
      institution: transfer ? "transfer" : "SFU",
      units,
    };
  });
}

// A saved plan packs to [basis, "2027-spring:BUS 373,@0", "~2027-summer:", ...]: one string
// per term, "~" marking a co-op term. Course codes only.
const packPlan = (plan: SavedPlan) => [
  plan.basis,
  ...plan.terms.map(
    (t) => `${t.kind === "coop" ? "~" : ""}${t.id}:${t.items.join(",")}`,
  ),
];

function unpackPlan(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const [basis, ...terms] = value as string[];
  return {
    basis,
    terms: terms.map((t) => {
      const coop = t.startsWith("~");
      const [id, items = ""] = (coop ? t.slice(1) : t).split(":");
      return {
        id,
        kind: coop ? "coop" : "study",
        items: items ? items.split(",") : [],
      };
    }),
  };
}

function packState(state: AppState) {
  return {
    ...state,
    plan: state.plan && packPlan(state.plan),
    profile: state.profile && {
      ...state.profile,
      courses: state.profile.courses.map(pack),
    },
    draft: state.draft && {
      ...state.draft,
      courses: state.draft.courses?.map(pack),
    },
  };
}

function unpackState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as Record<string, Record<string, unknown> | null>;
  const fix = (part: Record<string, unknown> | null | undefined) =>
    part && { ...part, courses: unpack(part.courses) };
  return {
    ...v,
    profile: fix(v.profile),
    draft: fix(v.draft),
    plan: unpackPlan(v.plan),
  };
}

/** Encrypts the state for this user and splits it into cookie values. */
export async function sealState(
  state: AppState,
  sub: string,
  secret: string,
): Promise<string[]> {
  const valid = appStateSchema.parse(state);
  const sealed = await encode({
    token: { sub, state: packState(valid) },
    secret,
    salt: SALT,
    maxAge: MAX_AGE_SECONDS,
  });
  const chunks: string[] = [];
  for (let i = 0; i < sealed.length; i += CHUNK_SIZE)
    chunks.push(sealed.slice(i, i + CHUNK_SIZE));
  if (chunks.length > MAX_CHUNKS) throw new StateTooLargeError();
  return chunks;
}

/**
 * Joins and decrypts the cookie values. Anything missing, tampered, expired, written for
 * another user or in an old shape reads as the empty state.
 */
export async function openState(
  chunks: (string | undefined)[],
  sub: string,
  secret: string,
): Promise<AppState> {
  const present: string[] = [];
  for (const chunk of chunks) {
    if (!chunk) break;
    present.push(chunk);
  }
  if (present.length === 0) return EMPTY_STATE;
  try {
    const token = await decode({ token: present.join(""), secret, salt: SALT });
    if (!token || token.sub !== sub) return EMPTY_STATE;
    const parsed = appStateSchema.safeParse(unpackState(token.state));
    return parsed.success ? parsed.data : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}
