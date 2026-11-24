// Cached ranked info per player, refreshed from HenrikDev.
import { fetchRank } from "./henrik";
import { supabaseAdmin } from "./supabase";

export type PlayerRank = {
  player_id: string;
  status: "ok" | "not_found" | "unranked" | "error";
  error: string | null;
  current_tier: string | null;
  current_tier_id: number | null;
  current_rr: number | null;
  peak_tier: string | null;
  peak_tier_id: number | null;
  peak_rr: number | null;
  peak_season: string | null;
  fetched_at: string;
};

export const RANK_MAX_AGE_HOURS = 12;

export function isStale(rank: PlayerRank | null) {
  if (!rank) return true;
  return Date.now() - Date.parse(rank.fetched_at) > RANK_MAX_AGE_HOURS * 3_600_000;
}

/** Immortal 1 and up. Checked by name: tier ids were renumbered in Episode 5. */
export const isImmortalPlus = (tier: string | null | undefined) => /^(Immortal|Radiant)/.test(tier ?? "");

/** "e9a3" → "E9 Act 3", "v25a1" → "V25 Act 1"; anything else uppercased. */
export function formatSeason(short: string | null | undefined) {
  if (!short) return null;
  const m = /^([a-z]+)(\d+)a(\d+)$/i.exec(short.trim());
  return m ? `${m[1].toUpperCase()}${m[2]} Act ${m[3]}` : short.toUpperCase();
}

/**
 * Fetch one player's rank and save it. Also stores their permanent account id
 * and, if they renamed in game, updates their name so screenshots keep matching.
 */
export async function refreshPlayerRank(playerId: string) {
  const db = supabaseAdmin();
  const { data: p } = await db
    .from("players")
    .select("id, riot_name, riot_tag, puuid")
    .eq("id", playerId)
    .single();
  if (!p) throw new Error("Player not found.");

  const r = await fetchRank({ puuid: p.puuid, name: p.riot_name, tag: p.riot_tag });
  if (r.status === "error" && r.retryAfterSec) return r; // rate limited: keep the old cache

  const row: Omit<PlayerRank, "fetched_at"> & { fetched_at: string } = {
    player_id: p.id,
    status: r.status,
    error: "error" in r ? r.error : null,
    current_tier: null, current_tier_id: null, current_rr: null,
    peak_tier: null, peak_tier_id: null, peak_rr: null, peak_season: null,
    fetched_at: new Date().toISOString(),
  };
  if (r.status === "ok" || r.status === "unranked") {
    Object.assign(row, {
      current_tier: r.current?.tier ?? null, current_tier_id: r.current?.tierId ?? null, current_rr: r.current?.rr ?? null,
      peak_tier: r.peak?.tier ?? null, peak_tier_id: r.peak?.tierId ?? null, peak_rr: r.peak?.rr ?? null,
      peak_season: r.peak?.season ?? null,
    });
    const renamed = r.name !== p.riot_name || r.tag !== p.riot_tag;
    await db
      .from("players")
      .update({ puuid: r.puuid, ...(renamed ? { riot_name: r.name, riot_tag: r.tag } : {}) })
      .eq("id", p.id);
  }
  await db.from("player_ranks").upsert(row, { onConflict: "player_id" });
  return r;
}
