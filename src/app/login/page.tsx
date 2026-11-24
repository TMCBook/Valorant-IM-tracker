"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      setError("Sign-in didn't complete. Please try again.");
    }
  }, []);

  async function discord() {
    setError("");
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("idle");
    } else setState("sent");
  }

  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="text-2xl font-bold">Sign in</h1>

      <button
        onClick={discord}
        className="flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] py-2.5 font-semibold text-white hover:bg-[#4752c4]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
          <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.5 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.8-3.6-13.8ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
        </svg>
        Sign in with Discord
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="border-t border-zinc-800 pt-4">
        {!showEmail ? (
          <button onClick={() => setShowEmail(true)} className="btn btn-secondary w-full">
            No Discord? Sign in with an email link
          </button>
        ) : state === "sent" ? (
          <p className="text-sm text-zinc-300">Check {email} for a sign-in link. Open it in this same browser.</p>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
            />
            <button
              disabled={state === "sending"}
              className="w-full rounded border border-zinc-700 py-2 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
