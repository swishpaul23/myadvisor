// Which requests need a signed-in user, and where to send them. Plain functions (no Next
// or Auth.js imports) so src/proxy.ts stays thin and the rules are unit-tested.

export const SIGN_IN_PATH = "/sign-in";

/** Files served as-is: Next build output, the favicon, and anything with a file extension. */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

/** Reachable while signed out: the sign-in page, Auth.js endpoints, static assets. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    isStaticAsset(pathname)
  );
}

/**
 * A same-site path to return to after sign-in. Anything else (absolute URLs,
 * protocol-relative "//host", backslash tricks, arrays) becomes "/".
 */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  return value;
}

/**
 * The redirect for a request, or null to let it through.
 * - Signed out, protected path: to the sign-in page, remembering where they were going.
 * - Signed in, on the sign-in page: on to their callbackUrl (or home).
 */
export function authRedirect(url: URL, signedIn: boolean): URL | null {
  const { pathname } = url;
  if (signedIn && pathname === SIGN_IN_PATH) {
    return new URL(
      safeCallbackUrl(url.searchParams.get("callbackUrl")),
      url.origin,
    );
  }
  if (signedIn || isPublicPath(pathname)) return null;
  const target = new URL(SIGN_IN_PATH, url.origin);
  target.searchParams.set("callbackUrl", `${pathname}${url.search}`);
  return target;
}
