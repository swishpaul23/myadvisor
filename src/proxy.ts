import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authRedirect } from "@/lib/auth/routes";

// Next 16 "proxy" (formerly middleware): signed-out users go to the sign-in page, except
// for the sign-in page itself, /api/auth/* and static assets (src/lib/auth/routes.ts).
// This is an optimistic cookie check; API routes and server actions still call
// requireUser().
export const proxy = auth((req) => {
  const target = authRedirect(req.nextUrl, Boolean(req.auth?.user));
  return target ? NextResponse.redirect(target) : NextResponse.next();
});

export const config = {
  // Skip Next build output and files with an extension before running auth at all.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
