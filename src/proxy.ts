import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { ApiError } from "@/lib/app/types";
import { authDecision } from "@/lib/auth/routes";

// Next 16 "proxy" (formerly middleware). Public: the landing page, /sign-in, /api/auth/* and
// static assets. Everything else needs a signed-in user (src/lib/auth/routes.ts). This is
// an optimistic cookie check; API routes and server actions still call requireUser().
export const proxy = auth((req) => {
  const decision = authDecision(req.nextUrl, Boolean(req.auth?.user));
  if (decision.kind === "redirect") return NextResponse.redirect(decision.url);
  if (decision.kind === "unauthorized")
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
        message: "Sign in to continue.",
      } satisfies ApiError,
      { status: 401 },
    );
  return NextResponse.next();
});

export const config = {
  // Skip Next build output and files with an extension before running auth at all.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
