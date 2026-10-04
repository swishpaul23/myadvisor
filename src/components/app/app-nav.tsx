"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FOCUS } from "./styles";

export const NAV = [
  { href: "/app", label: "Overview" },
  { href: "/app/advisor", label: "Advisor" },
  { href: "/app/plan", label: "My plan" },
  { href: "/app/record", label: "Academic record" },
] as const;

/** Sidebar navigation (a horizontal strip on phones), as the landing preview's. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="App">
      <ul className="flex flex-col gap-0.5 max-[900px]:flex-row max-[900px]:overflow-x-auto">
        {NAV.map((item) => {
          const current =
            item.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-none">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-[8px] border px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors",
                  current
                    ? "border-line-soft bg-white font-medium text-ink"
                    : "border-transparent text-ink-body hover:text-ink",
                  FOCUS,
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
