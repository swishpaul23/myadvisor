import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SIGN_IN_PATH } from "@/lib/auth/routes";

// Auth.js (next-auth v5): Google sign-in, JWT sessions in a cookie, no database adapter
// (the database choice isn't made yet). Reads AUTH_SECRET, GCP_AUTH_CLIENT_ID and
// GCP_AUTH_ID_SECRET from the environment. The Google credentials are passed explicitly
// because Auth.js would otherwise look for AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET and, when
// those are missing, send Google client_id=undefined. Session type: src/types/next-auth.d.ts.

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GCP_AUTH_CLIENT_ID,
      clientSecret: process.env.GCP_AUTH_ID_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: SIGN_IN_PATH, error: SIGN_IN_PATH },
  callbacks: {
    // Only Google accounts with a verified email.
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      return profile?.email_verified === true;
    },
    // Without an adapter Auth.js gives each sign-in a random user.id, so the stable id
    // is Google's `sub` (the account's providerAccountId), stored as token.sub.
    jwt({ token, account }) {
      if (account?.provider === "google") token.sub = account.providerAccountId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      return session;
    },
  },
});
