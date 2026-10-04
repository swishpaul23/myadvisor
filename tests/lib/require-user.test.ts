import type { Session } from "next-auth";
import { beforeEach, describe, expect, test, vi } from "vitest";

// requireUser() reads the session through Auth.js; mock it so no cookies or secrets are
// needed. "server-only" throws outside a React server environment, so it is stubbed too.
const auth = vi.fn<() => Promise<Session | null>>();
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: () => auth() }));

const { requireUser, sessionUser, UnauthorizedError } =
  await import("@/lib/auth/require-user");

const session = (user: Partial<Session["user"]>): Session => ({
  user: { id: "", ...user } as Session["user"],
  expires: "2099-01-01T00:00:00.000Z",
});

beforeEach(() => auth.mockReset());

describe("requireUser", () => {
  test("returns id (Google sub), email and name", async () => {
    auth.mockResolvedValue(
      session({
        id: "1234567890",
        email: "student@example.com",
        name: "Demo Student",
      }),
    );
    await expect(requireUser()).resolves.toEqual({
      id: "1234567890",
      email: "student@example.com",
      name: "Demo Student",
    });
  });

  test("name is null when Google gives none", async () => {
    auth.mockResolvedValue(session({ id: "1", email: "a@example.com" }));
    await expect(requireUser()).resolves.toMatchObject({ name: null });
  });

  test("throws UnauthorizedError (status 401) when signed out", async () => {
    auth.mockResolvedValue(null);
    const err = await requireUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toMatchObject({ status: 401, message: "Not signed in." });
  });

  test("throws when the session has no id or no email", () => {
    expect(() => sessionUser(session({ email: "a@example.com" }))).toThrow(
      UnauthorizedError,
    );
    expect(() => sessionUser(session({ id: "1" }))).toThrow(UnauthorizedError);
  });
});
