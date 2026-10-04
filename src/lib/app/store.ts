import "server-only";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/require-user";
import {
  chunkName,
  MAX_AGE_SECONDS,
  MAX_CHUNKS,
  openState,
  sealState,
} from "./state-cookie";
import type { AppState } from "./types";

// Where the signed-in student's profile and onboarding draft live. Today: encrypted cookies
// on the student's own device (no database yet, and no student data on our servers). Swap
// this module for a database later; callers only use readState / writeState / clearState.
// writeState and clearState work only in server actions and route handlers.

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

export async function readState(): Promise<AppState> {
  const user = await requireUser();
  const jar = await cookies();
  const chunks = Array.from(
    { length: MAX_CHUNKS },
    (_, i) => jar.get(chunkName(i))?.value,
  );
  return openState(chunks, user.id, secret());
}

/** Saves the state. Throws StateTooLargeError if it doesn't fit. */
export async function writeState(state: AppState): Promise<void> {
  const user = await requireUser();
  const chunks = await sealState(state, user.id, secret());
  const jar = await cookies();
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const value = chunks[i];
    if (value === undefined) {
      if (jar.get(chunkName(i))) jar.delete(chunkName(i));
      continue;
    }
    jar.set(chunkName(i), value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
}

export async function clearState(): Promise<void> {
  await requireUser();
  const jar = await cookies();
  for (let i = 0; i < MAX_CHUNKS; i++) jar.delete(chunkName(i));
}
