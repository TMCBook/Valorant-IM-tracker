// Who is this signed-in user on Discord, and does that match a player's sign-up?
import type { User } from "@supabase/supabase-js";

export type DiscordId = { username: string; displayName: string | null };

/** Discord identity from a Supabase user who signed in with Discord, else null. */
export function discordOf(user: User): DiscordId | null {
  const providers: string[] = user.app_metadata?.providers ?? [];
  if (!providers.includes("discord")) return null;
  const m = user.user_metadata ?? {};
  // Discord usernames come through as full_name ("book1314") or name ("book1314#0").
  const username = String(m.full_name || String(m.name ?? "").replace(/#0$/, "")).trim();
  if (!username) return null;
  return { username, displayName: m.custom_claims?.global_name ?? null };
}

const norm = (s: string) => s.toLowerCase().trim().replace(/^@/, "");

/**
 * "exact"   the sign-up Discord is this user's username → safe to claim instantly
 * "display" it matches only their display name → anyone can set that, so an admin confirms
 * null      no match
 */
export function discordMatch(signup: string | null | undefined, d: DiscordId | null): "exact" | "display" | null {
  if (!signup || !d) return null;
  if (norm(signup) === norm(d.username)) return "exact";
  if (d.displayName && norm(signup) === norm(d.displayName)) return "display";
  return null;
}
