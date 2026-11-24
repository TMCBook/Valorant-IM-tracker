import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { getViewer } from "@/lib/auth";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IM Valorant Tracker",
  description: "Stats, match history and standings for our intramural Valorant league.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const link = "text-zinc-300 hover:text-white";
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased bg-zinc-950 text-zinc-100 min-h-screen`}>
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="font-bold text-rose-400">IM Valorant</Link>
            <Link href="/players" className={link}>Players</Link>
            <Link href="/teams" className={link}>Teams</Link>
            <Link href="/matches" className={link}>Matches</Link>
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
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
