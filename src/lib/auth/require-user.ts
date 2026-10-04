import "server-only";
import type { Session } from "next-auth";
import { auth } from "@/auth";

export type SessionUser = {
  /** Google `sub`: stable across sign-ins. */
  id: string;
  email: string;
  name: string | null;
};

/** Thrown when there is no signed-in user. API routes can map it to HTTP 401. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Not signed in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The user on a session, or throws UnauthorizedError if there is none (or no id/email). */
export function sessionUser(session: Session | null): SessionUser {
  const user = session?.user;
  if (!user?.id || !user.email) throw new UnauthorizedError();
  return { id: user.id, email: user.email, name: user.name ?? null };
}

/**
 * The signed-in user, for API routes and server actions. Throws UnauthorizedError
 * otherwise. Use this even though src/proxy.ts redirects: the proxy is only a first check.
 */
export async function requireUser(): Promise<SessionUser> {
  return sessionUser(await auth());
}
