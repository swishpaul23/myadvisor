import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { signIn } from "@/auth";
import { SIGN_IN_PATH, safeCallbackUrl } from "@/lib/auth/routes";

// GET /sign-in/google?callbackUrl=/app/start starts Google sign-in straight away, so plain
// links (landing CTAs, the proxy's redirect) need no sign-in page. Signed-in users never get
// here: src/proxy.ts sends them on to callbackUrl. signIn() ends by throwing Next's redirect
// to Google; any other failure goes to the fallback page with ?error=Configuration.
export async function GET(req: NextRequest) {
  const redirectTo = safeCallbackUrl(
    req.nextUrl.searchParams.get("callbackUrl"),
  );
  try {
    await signIn("google", { redirectTo });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Google sign-in could not start", (error as Error)?.name);
  }
  const fallback = new URL(SIGN_IN_PATH, req.nextUrl.origin);
  fallback.searchParams.set("error", "Configuration");
  fallback.searchParams.set("callbackUrl", redirectTo);
  return NextResponse.redirect(fallback);
}
