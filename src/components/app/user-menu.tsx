import { auth, signOut } from "@/auth";
import { cn } from "@/lib/utils";
import { FOCUS } from "./styles";

function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[1]?.[0] ?? "") : "")
  ).toUpperCase();
}

/** Avatar, name and a sign-out button. Renders nothing when signed out. */
export async function UserMenu({
  detail,
  compact = false,
}: {
  /** Second line under the name, e.g. "BBA · Finance". */
  detail?: string;
  /** Avatar and sign-out only (onboarding header). */
  compact?: boolean;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) return null;
  const name = user.name ?? user.email;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white"
      >
        {initials(user.name, user.email)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-[13px] leading-[1.3]",
          compact && "max-[640px]:sr-only",
        )}
      >
        <span className="block truncate">{name}</span>
        {detail && (
          <span className="block truncate text-[12px] text-ink-muted">
            {detail}
          </span>
        )}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className={cn(
            "rounded-[8px] px-2 py-1.5 text-[12px] text-ink-body transition-colors hover:bg-line-soft hover:text-ink",
            FOCUS,
          )}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
