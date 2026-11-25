import "server-only";
import { supabasePublic } from "./supabase";
import type { Match, MatchMap, Team } from "./types";

export type Standing = {
  team: Team;
  played: number;
  wins: number;
  losses: number;
  mapWins: number;
  mapLosses: number;
  roundDiff: number;
};

/** Series and map records for every team in one season, best first. */
export async function standings(seasonId: string): Promise<Standing[]> {
  const db = supabasePublic();
  const [{ data: teams }, { data: matches }] = await Promise.all([
    db.from("teams").select("*").eq("season_id", seasonId),
    db.from("matches").select("*").eq("season_id", seasonId).eq("status", "completed"),
  ]);
  const ids = (matches ?? []).map((m) => m.id as string);
  const { data: maps } = ids.length ? await db.from("match_maps").select("*").in("match_id", ids) : { data: [] };
  const rows = new Map<string, Standing>(
    ((teams ?? []) as Team[]).map((t) => [
      t.id,
      { team: t, played: 0, wins: 0, losses: 0, mapWins: 0, mapLosses: 0, roundDiff: 0 },
    ]),
  );
  const byId = new Map(((matches ?? []) as Match[]).map((m) => [m.id, m]));
  for (const m of byId.values()) {
    for (const id of [m.team_a_id, m.team_b_id]) {
      const r = rows.get(id);
      if (!r) continue;
      r.played++;
      if (m.winner_team_id === id) r.wins++;
      else if (m.winner_team_id) r.losses++;
    }
  }
  for (const mm of (maps ?? []) as MatchMap[]) {
    const m = byId.get(mm.match_id);
    if (!m) continue;
    const a = rows.get(m.team_a_id);
    const b = rows.get(m.team_b_id);
    if (!a || !b) continue;
    a.roundDiff += mm.team_a_rounds - mm.team_b_rounds;
    b.roundDiff += mm.team_b_rounds - mm.team_a_rounds;
    if (mm.team_a_rounds > mm.team_b_rounds) { a.mapWins++; b.mapLosses++; }
    else if (mm.team_b_rounds > mm.team_a_rounds) { b.mapWins++; a.mapLosses++; }
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.wins - x.wins ||
      x.losses - y.losses ||
      y.mapWins - y.mapLosses - (x.mapWins - x.mapLosses) ||
      y.roundDiff - x.roundDiff ||
      x.team.name.localeCompare(y.team.name),
  );
}
