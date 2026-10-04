import { describe, expect, test } from "vitest";
import {
  authRedirect,
  isPublicPath,
  safeCallbackUrl,
  SIGN_IN_PATH,
} from "@/lib/auth/routes";

const at = (path: string) => new URL(path, "http://localhost:3000");
const redirect = (path: string, signedIn: boolean) =>
  authRedirect(at(path), signedIn)?.toString() ?? null;

describe("authRedirect: signed out", () => {
  test("a protected page goes to sign-in, remembering path and query", () => {
    const target = authRedirect(at("/plan?term=2027-spring"), false)!;
    expect(target.pathname).toBe(SIGN_IN_PATH);
    expect(target.searchParams.get("callbackUrl")).toBe(
      "/plan?term=2027-spring",
    );
    expect(target.origin).toBe("http://localhost:3000");
  });
  test("the home page and API routes are protected too", () => {
    expect(redirect("/", false)).toBe(
      "http://localhost:3000/sign-in?callbackUrl=%2F",
    );
    expect(redirect("/api/audit", false)).toMatch(
      /^http:\/\/localhost:3000\/sign-in\?/,
    );
  });
  test("the sign-in page, /api/auth/* and static assets pass through", () => {
    for (const path of [
      "/sign-in",
      "/sign-in?callbackUrl=%2Fplan",
      "/api/auth/signin/google",
      "/api/auth/callback/google?code=x",
      "/api/auth/session",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/next.svg",
    ]) {
      expect(redirect(path, false), path).toBeNull();
    }
  });
  test("lookalike paths are not public", () => {
    expect(isPublicPath("/sign-in-other")).toBe(false);
    expect(isPublicPath("/api/authx")).toBe(false);
    expect(isPublicPath("/api/auth-admin/secret")).toBe(false);
  });
});

describe("authRedirect: signed in", () => {
  test("protected pages pass through", () => {
    expect(redirect("/", true)).toBeNull();
    expect(redirect("/plan?term=2027-spring", true)).toBeNull();
  });
  test("the sign-in page sends them on to their callbackUrl, or home", () => {
    expect(redirect("/sign-in?callbackUrl=%2Fplan", true)).toBe(
      "http://localhost:3000/plan",
    );
    expect(redirect("/sign-in", true)).toBe("http://localhost:3000/");
  });
  test("never redirects off-site from a crafted callbackUrl", () => {
    for (const cb of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
    ]) {
      expect(
        redirect(`/sign-in?callbackUrl=${encodeURIComponent(cb)}`, true),
        cb,
      ).toBe("http://localhost:3000/");
    }
  });
});

describe("safeCallbackUrl", () => {
  test("keeps same-site paths", () => {
    expect(safeCallbackUrl("/plan?term=2027-spring")).toBe(
      "/plan?term=2027-spring",
    );
  });
  test("anything else becomes /", () => {
    for (const v of [
      undefined,
      null,
      "",
      "plan",
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      ["/a", "/b"],
    ]) {
      expect(safeCallbackUrl(v), String(v)).toBe("/");
    }
  });
});

describe("src/proxy.ts matcher", () => {
  // The same pattern as `config.matcher` in src/proxy.ts (Next matches it against the path).
  const matcher =
    /^\/((?!_next\/static|_next\/image|favicon.ico|.*\.[a-zA-Z0-9]+$).*)$/;
  test("runs on pages and API routes", () => {
    for (const p of [
      "/",
      "/plan",
      "/sign-in",
      "/api/audit",
      "/api/auth/session",
    ]) {
      expect(matcher.test(p), p).toBe(true);
    }
  });
  test("skips build output and files", () => {
    for (const p of [
      "/_next/static/chunks/a.js",
      "/_next/image",
      "/favicon.ico",
      "/next.svg",
    ]) {
      expect(matcher.test(p), p).toBe(false);
    }
  });
});
