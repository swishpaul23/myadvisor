import { describe, expect, test } from "vitest";
import {
  APP_HOME,
  authDecision,
  isPublicPath,
  safeCallbackUrl,
  SIGN_IN_PATH,
} from "@/lib/auth/routes";

const at = (path: string) => new URL(path, "http://localhost:3000");
/** "next", "401", or the redirect target as a string. */
const decide = (path: string, signedIn: boolean) => {
  const d = authDecision(at(path), signedIn);
  if (d.kind === "redirect") return d.url.toString();
  return d.kind === "unauthorized" ? "401" : "next";
};

describe("authDecision: signed out", () => {
  test("an app page goes to sign-in, remembering path and query", () => {
    const d = authDecision(at("/app/plan?term=2027-spring"), false);
    expect(d.kind).toBe("redirect");
    if (d.kind !== "redirect") return;
    expect(d.url.pathname).toBe(SIGN_IN_PATH);
    expect(d.url.searchParams.get("callbackUrl")).toBe(
      "/app/plan?term=2027-spring",
    );
    expect(d.url.origin).toBe("http://localhost:3000");
  });
  test("API routes answer 401 instead of redirecting", () => {
    expect(decide("/api/transcript", false)).toBe("401");
    expect(decide("/api", false)).toBe("401");
  });
  test("the landing page, sign-in, /api/auth/* and static assets are public", () => {
    for (const path of [
      "/",
      "/sign-in",
      "/sign-in?callbackUrl=%2Fapp",
      "/api/auth/signin/google",
      "/api/auth/callback/google?code=x",
      "/api/auth/session",
      "/_next/static/chunks/main.js",
      "/favicon.ico",
      "/next.svg",
    ]) {
      expect(decide(path, false), path).toBe("next");
    }
  });
  test("lookalike paths are not public", () => {
    expect(isPublicPath("/sign-in-other")).toBe(false);
    expect(isPublicPath("/api/authx")).toBe(false);
    expect(isPublicPath("/api/auth-admin/secret")).toBe(false);
    expect(isPublicPath("/app")).toBe(false);
  });
});

describe("authDecision: signed in", () => {
  test("the landing page sends them to the app", () => {
    expect(decide("/", true)).toBe("http://localhost:3000/app");
  });
  test("app pages and API routes pass through", () => {
    expect(decide("/app", true)).toBe("next");
    expect(decide("/app/plan?term=2027-spring", true)).toBe("next");
    expect(decide("/api/transcript", true)).toBe("next");
  });
  test("the sign-in page sends them on to their callbackUrl, or the app", () => {
    expect(decide("/sign-in?callbackUrl=%2Fapp%2Fplan", true)).toBe(
      "http://localhost:3000/app/plan",
    );
    expect(decide("/sign-in", true)).toBe(`http://localhost:3000${APP_HOME}`);
  });
  test("never redirects off-site from a crafted callbackUrl", () => {
    for (const cb of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
    ]) {
      expect(
        decide(`/sign-in?callbackUrl=${encodeURIComponent(cb)}`, true),
        cb,
      ).toBe("http://localhost:3000/app");
    }
  });
});

describe("safeCallbackUrl", () => {
  test("keeps same-site paths", () => {
    expect(safeCallbackUrl("/app/plan?term=2027-spring")).toBe(
      "/app/plan?term=2027-spring",
    );
  });
  test("anything else becomes the app home", () => {
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
      expect(safeCallbackUrl(v), String(v)).toBe(APP_HOME);
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
      "/app",
      "/sign-in",
      "/api/transcript",
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
