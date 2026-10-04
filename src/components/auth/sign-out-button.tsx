import { auth, signOut } from "@/auth";
import { SIGN_IN_PATH } from "@/lib/auth/routes";

// TODO(frontend): Vaibhav to restyle. Plain markup on purpose; keep the form action.

/** Who is signed in, and a sign-out button. Renders nothing when signed out. */
export async function SignOutButton() {
  const session = await auth();
  if (!session?.user) return null;
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: SIGN_IN_PATH });
      }}
    >
      <span>{session.user.name ?? session.user.email}</span>{" "}
      <button type="submit">Sign out</button>
    </form>
  );
}
