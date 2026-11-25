import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import SeasonPicker from "@/components/SeasonPicker";
import { getViewer } from "@/lib/auth";
import { seasonContext } from "@/lib/season";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IM Valorant Tracker",
  description: "Stats, match history and standings for our intramural Valorant league.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [viewer, season] = await Promise.all([getViewer(), seasonContext()]);
  const link = "text-zinc-300 hover:text-white";
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased bg-zinc-950 text-zinc-100 min-h-screen`}>
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="font-bold text-rose-400">IM Valorant</Link>
            {season.selected && (
              <SeasonPicker
                seasons={season.all.map((s) => ({ name: s.name, is_current: s.is_current }))}
                selected={season.selected.name}
              />
            )}
            <Link href="/players" className={link}>Players</Link>
            <Link href="/teams" className={link}>Teams</Link>
            <Link href="/matches" className={link}>Matches</Link>
            <Link href="/leaderboards" className={link}>Leaderboards</Link>
            <div className="ml-auto flex items-center gap-4">
              {viewer?.canUpload && (
                <Link href="/upload" className="btn btn-primary btn-sm">
                  Upload result
                </Link>
              )}
              {viewer?.isAdmin && <Link href="/admin" className={link}>Admin</Link>}
              <Link href={viewer ? "/account" : "/login"} className={link}>
                {viewer ? "Account" : "Sign in"}
              </Link>
            </div>
          </nav>
        </header>
        {season.archived && (
          <div className="border-b border-amber-900/60 bg-amber-950/40">
            <p className="mx-auto max-w-6xl px-4 py-2 text-sm text-amber-200">
              You&apos;re viewing <b>{season.selected!.name}</b>, an archived season. Pick{" "}
              <b>{season.current?.name}</b> in the season menu to see the current one.
            </p>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
