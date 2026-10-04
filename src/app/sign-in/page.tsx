import { signIn } from "@/auth";
import { safeCallbackUrl } from "@/lib/auth/routes";

// TODO(frontend): Vaibhav to restyle. Plain markup on purpose; keep the form action.

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = safeCallbackUrl(callbackUrl);

  return (
    <main>
      <h1>Sign in to myAdvisor</h1>
      {error ? (
        <p role="alert">Sign-in didn&apos;t work. Please try again.</p>
      ) : null}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
