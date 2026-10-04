import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { DataSourceBadge } from "@/components/data-source-badge";
import { Badge } from "@/components/ui/badge";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyAdvisor",
  description:
    "Plan your degree, term by term. See where you stand and get a next-term plan by text or voice, with sources.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <div className="fixed top-3 right-3 z-50">
          <Suspense fallback={<Badge variant="outline">Data: loading…</Badge>}>
            <DataSourceBadge />
          </Suspense>
          <Suspense fallback={null}>
            <SignOutButton />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
