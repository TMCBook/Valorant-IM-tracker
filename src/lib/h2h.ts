import "server-only";
import { supabasePublic } from "./supabase";
import type { Match, MatchMap } from "./types";

export type Meeting = { match: Match; aMaps: number; bMaps: number; winner: "a" | "b" | null; date: string };

/**
 * Every match between two teams, counted from team A's side: series record,
 * map record and round totals. Only completed series count toward the record.
 */
export async function headToHead(teamA: string, teamB: string) {
  const db = supabasePublic();
  const { data: matchRows } = await db
    .from("matches")
    .select("*")
    .or(`and(team_a_id.eq.${teamA},team_b_id.eq.${teamB}),and(team_a_id.eq.${teamB},team_b_id.eq.${teamA})`);
  const matches = (matchRows ?? []) as Match[];
  const { data: mapRows } = matches.length
    ? await db.from("match_maps").select("*").in("match_id", matches.map((m) => m.id))
    : { data: [] };
  const maps = (mapRows ?? []) as MatchMap[];

  const meetings: Meeting[] = [];
  let seriesA = 0, seriesB = 0, mapsA = 0, mapsB = 0, roundsA = 0, roundsB = 0;
  for (const m of matches) {
    const flip = m.team_a_id !== teamA; // stored the other way round
    let aMaps = 0, bMaps = 0;
    for (const mm of maps.filter((x) => x.match_id === m.id)) {
      const ra = flip ? mm.team_b_rounds : mm.team_a_rounds;
      const rb = flip ? mm.team_a_rounds : mm.team_b_rounds;
      roundsA += ra;
      roundsB += rb;
      if (ra > rb) aMaps++;
      else if (rb > ra) bMaps++;
    }
    mapsA += aMaps;
    mapsB += bMaps;
    const winner = m.winner_team_id === teamA ? "a" : m.winner_team_id === teamB ? "b" : null;
    if (m.status === "completed" && winner === "a") seriesA++;
    if (m.status === "completed" && winner === "b") seriesB++;
    meetings.push({ match: m, aMaps, bMaps, winner, date: m.scheduled_at ?? m.created_at });
  }
  meetings.sort((x, y) => y.date.localeCompare(x.date));
  return { meetings, seriesA, seriesB, mapsA, mapsB, roundsA, roundsB };
}
