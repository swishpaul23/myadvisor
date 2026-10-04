import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/app/app-nav";
import { FOCUS } from "@/components/app/styles";
import { UserMenu } from "@/components/app/user-menu";
import { BrandMark } from "@/components/landing/brand-mark";
import { getDegreeView } from "@/lib/app/degree";
import { cn } from "@/lib/utils";

/**
 * The signed-in app: sidebar (brand, nav, user, data source) and the screen. Students
 * without a finished profile go to onboarding first (checked here, before any streaming, so
 * it's a real redirect).
 */
export default async function ShellLayout({ children }: LayoutProps<"/app">) {
  const view = await getDegreeView();
  if (!view) redirect("/app/start");
  const { profile, dataSource, dataFallback } = view;
  const detail = `BBA · ${profile.concentrations.join(" & ")}`;
  return (
    <div className="flex min-h-full flex-1 bg-white text-ink max-[900px]:flex-col">
      <aside className="sticky top-0 box-content flex h-dvh w-[184px] flex-none flex-col gap-0.5 border-r border-line-soft bg-surface-subtle px-3 py-[18px] max-[900px]:static max-[900px]:h-auto max-[900px]:w-auto max-[900px]:gap-3 max-[900px]:border-r-0 max-[900px]:border-b max-[900px]:px-4 max-[900px]:py-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/app"
            className={cn(
              "flex items-center gap-2 px-2 pt-0.5 pb-4 text-[14px] font-semibold max-[900px]:p-0",
              FOCUS,
            )}
          >
            <BrandMark className="size-5 rounded-[6px] [&_svg]:size-3" />
            MyAdvisor
          </Link>
          <div className="min-[901px]:hidden">
            <UserMenu compact />
          </div>
        </div>
        <AppNav />
        <div className="mt-auto flex flex-col gap-2 border-t border-line-soft px-1 pt-3 max-[900px]:hidden">
          <UserMenu detail={detail} />
          <p className="px-1 text-[11px] text-ink-muted">
            Data:{" "}
            {dataSource === "snowflake"
              ? "Snowflake"
              : dataFallback
                ? "JSON (Snowflake unavailable)"
                : "JSON snapshot"}
          </p>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-4 px-7 py-6 max-[640px]:px-4">
        {children}
      </main>
    </div>
  );
}
