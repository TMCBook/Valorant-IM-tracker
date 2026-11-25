import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin, supabasePublic } from "./supabase";

export type Season = {
  id: string;
  name: string;
  is_current: boolean;
  started_at: string;
  archived_at: string | null;
};

export const SEASON_COOKIE = "season";
/** Used in queries when no season exists yet, so they match nothing instead of erroring. */
export const NO_SEASON = "00000000-0000-0000-0000-000000000000";

/** All seasons, newest first. */
export async function allSeasons(): Promise<Season[]> {
  const { data } = await supabasePublic().from("seasons").select("*").order("started_at", { ascending: false });
  return (data ?? []) as Season[];
}

/**
 * Which season the visitor is looking at. Defaults to the current season;
 * the top-bar picker stores another choice in a cookie.
 */
export async function seasonContext() {
  const all = await allSeasons();
  const current = all.find((s) => s.is_current) ?? all[0] ?? null;
  const picked = (await cookies()).get(SEASON_COOKIE)?.value;
  const selected = all.find((s) => s.name === picked) ?? current;
  return { all, current, selected, archived: !!selected && !selected.is_current };
}

/** The current season, for writes (uploads, imports, new teams). Throws if none exists. */
export async function currentSeason(): Promise<Season> {
  const { data } = await supabaseAdmin().from("seasons").select("*").eq("is_current", true).maybeSingle();
  if (!data) throw new Error("No current season. Run supabase/migrations/005_seasons.sql.");
  return data as Season;
}

/** Player id → team id for one season's roster. */
export async function seasonRoster(seasonId: string) {
  const { data } = await supabasePublic().from("season_rosters").select("player_id, team_id").eq("season_id", seasonId);
  return new Map((data ?? []).map((r) => [r.player_id as string, r.team_id as string]));
}
