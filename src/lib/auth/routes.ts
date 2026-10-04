// Which requests need a signed-in user, and where to send them. Plain functions (no Next
// or Auth.js imports) so src/proxy.ts stays thin and the rules are unit-tested.

/** Fallback page, shown only for Auth.js errors (?error=...). */
export const SIGN_IN_PATH = "/sign-in";
/** GET ?callbackUrl=/path starts Google sign-in directly (src/app/sign-in/google/route.ts). */
export const GOOGLE_SIGN_IN_PATH = "/sign-in/google";
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

/** Link that starts Google sign-in and lands on `target` afterwards. */
export function googleSignInHref(target: string): string {
  return `${GOOGLE_SIGN_IN_PATH}?${new URLSearchParams({ callbackUrl: target })}`;
}

/** Reachable while signed out: the landing page, sign-in, Auth.js endpoints, static assets. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === SIGN_IN_PATH ||
    pathname === GOOGLE_SIGN_IN_PATH ||
    isAuthApi(pathname) ||
    isStaticAsset(pathname)
  );
}

/**
 * A same-site path to return to after sign-in. Anything else (absolute URLs,
 * protocol-relative "//host", backslash tricks, arrays) becomes the app home. The final
 * check catches what the URL parser rewrites, e.g. a tab in "/<TAB>/host" is stripped
 * into "//host".
 */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string") return APP_HOME;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return APP_HOME;
  if (new URL(value, "http://same.site").origin !== "http://same.site")
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
 * - Signed in, on either sign-in path: on to their callbackUrl (or the app).
 * - Signed out, on the sign-in page without an error: straight into Google sign-in.
 * - Signed out, on an API route (other than /api/auth): 401.
 * - Signed out, on any other protected path: straight into Google sign-in, then back there.
 */
export function authDecision(url: URL, signedIn: boolean): AuthDecision {
  const { pathname } = url;
  if (signedIn) {
    if (pathname === "/")
      return { kind: "redirect", url: new URL(APP_HOME, url.origin) };
    if (pathname === SIGN_IN_PATH || pathname === GOOGLE_SIGN_IN_PATH) {
      const back = safeCallbackUrl(url.searchParams.get("callbackUrl"));
      return { kind: "redirect", url: new URL(back, url.origin) };
    }
    return { kind: "next" };
  }
  const google = (target: string) => ({
    kind: "redirect" as const,
    url: new URL(googleSignInHref(target), url.origin),
  });
  if (pathname === SIGN_IN_PATH && !url.searchParams.has("error"))
    return google(safeCallbackUrl(url.searchParams.get("callbackUrl")));
  if (isPublicPath(pathname)) return { kind: "next" };
  if (pathname === "/api" || pathname.startsWith("/api/"))
    return { kind: "unauthorized" };
  return google(`${pathname}${url.search}`);
}
