import type { DefaultSession } from "next-auth";

// The signed-in user on the session: Google `sub` as a stable id, plus email and name.
declare module "next-auth" {
  interface Session {
    user: {
      /** Google `sub`: stable across sign-ins. Empty only if the token has none. */
      id: string;
    } & DefaultSession["user"];
  }
}
