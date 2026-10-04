// Which requests need a signed-in user, and where to send them. Plain functions (no Next
// or Auth.js imports) so src/proxy.ts stays thin and the rules are unit-tested.

export const SIGN_IN_PATH = "/sign-in";
/** Where signed-in users land: the app's Overview. */
export const APP_HOME = "/app";

/** Files served as-is: Next build output, the favicon, and anything with a file extension. */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

const isAuthApi = (pathname: string) =>
  pathname === "/api/auth" || pathname.startsWith("/api/auth/");

/** Reachable while signed out: the landing page, sign-in, Auth.js endpoints, static assets. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === SIGN_IN_PATH ||
    isAuthApi(pathname) ||
    isStaticAsset(pathname)
  );
}

/**
 * A same-site path to return to after sign-in. Anything else (absolute URLs,
 * protocol-relative "//host", backslash tricks, arrays) becomes the app home.
 */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string") return APP_HOME;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return APP_HOME;
  return value;
}

export type AuthDecision =
  | { kind: "next" }
  | { kind: "redirect"; url: URL }
  /** Signed-out API call: answer 401 JSON, not a redirect to an HTML page. */
  | { kind: "unauthorized" };

/**
 * What to do with a request.
 * - Signed in, on the landing page: on to the app.
 * - Signed in, on the sign-in page: on to their callbackUrl (or the app).
 * - Signed out, on an API route (other than /api/auth): 401.
 * - Signed out, on any other protected path: to sign-in, remembering where they were going.
 */
export function authDecision(url: URL, signedIn: boolean): AuthDecision {
  const { pathname } = url;
  if (signedIn) {
    if (pathname === "/")
      return { kind: "redirect", url: new URL(APP_HOME, url.origin) };
    if (pathname === SIGN_IN_PATH) {
      const back = safeCallbackUrl(url.searchParams.get("callbackUrl"));
      return { kind: "redirect", url: new URL(back, url.origin) };
    }
    return { kind: "next" };
  }
  if (isPublicPath(pathname)) return { kind: "next" };
  if (pathname === "/api" || pathname.startsWith("/api/"))
    return { kind: "unauthorized" };
  const target = new URL(SIGN_IN_PATH, url.origin);
  target.searchParams.set("callbackUrl", `${pathname}${url.search}`);
  return { kind: "redirect", url: target };
}
