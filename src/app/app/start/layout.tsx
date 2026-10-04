import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "@/components/app/user-menu";
import { FOCUS } from "@/components/app/styles";
import { BrandMark } from "@/components/landing/brand-mark";
import { cn } from "@/lib/utils";

/** Onboarding: a focused page on the landing grey, without the app sidebar. */
export default function StartLayout({ children }: LayoutProps<"/app/start">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="border-b border-line-soft bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-[760px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/app"
            className={cn(
              "flex items-center gap-2.5 text-[16px] font-semibold tracking-[-0.02em]",
              FOCUS,
            )}
          >
            <BrandMark />
            MyAdvisor
          </Link>
          <Suspense fallback={null}>
            <UserMenu compact />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  );
}
