import Link from "next/link";
import { BUTTON_SECONDARY, FOCUS, PANEL } from "@/components/app/styles";
import { BrandMark } from "@/components/landing/brand-mark";
import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";

// Auth.js sends its error code here as ?error=. AccessDenied comes from our signIn callback
// (no verified Google email); Configuration means the server's auth settings are wrong.
function errorMessage(code: string): string {
  if (code === "AccessDenied")
    return "That Google account can't sign in. Use an account with a verified email.";
  if (code === "Configuration")
    return "Sign-in isn't set up correctly on our side. Please try again later.";
  return "Sign-in didn't work. Please try again.";
}

/** Google sign-in, on the landing grey like onboarding. */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = safeCallbackUrl(callbackUrl);
  const errorCode = Array.isArray(error) ? error[0] : error;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="border-b border-line-soft bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-[760px] items-center px-4 sm:px-6">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.02em]",
              FOCUS,
            )}
          >
            <BrandMark />
            MyAdvisor
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        <div
          className={cn(
            PANEL,
            "flex w-full max-w-[400px] flex-col gap-5 p-6 sm:p-8",
          )}
        >
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[21px] font-semibold tracking-[-0.02em]">
              Sign in to MyAdvisor
            </h1>
            <p className="text-[14px] leading-[1.5] text-ink-body">
              Plan your SFU Beedie BBA degree, check requirements, and ask the
              advisor.
            </p>
          </div>
          {errorCode !== undefined ? (
            <p
              role="alert"
              className="rounded-[10px] border border-brand/25 bg-brand/5 px-3 py-2.5 text-[13px] leading-[1.45] text-brand"
            >
              {errorMessage(errorCode)}
            </p>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button type="submit" className={cn(BUTTON_SECONDARY, "w-full")}>
              <GoogleLogo />
              Continue with Google
            </button>
          </form>
          <p className="text-[12px] leading-[1.45] text-ink-muted">
            Sign-in uses your Google account, not your SFU account. MyAdvisor
            can&apos;t see your SFU records.
          </p>
        </div>
      </main>
    </div>
  );
}

/** Google's "G" mark, in its own colours as Google's sign-in guidelines ask. */
function GoogleLogo() {
  return (
    <svg aria-hidden="true" width={18} height={18} viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
