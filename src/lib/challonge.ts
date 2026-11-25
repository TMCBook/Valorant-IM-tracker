import "server-only";
import { currentSeason } from "./season";
import { supabaseAdmin } from "./supabase";

type CParticipant = {
  participant: { id: number; name: string; display_name?: string; group_player_ids?: number[] };
};
type CMatch = {
  match: {
    id: number;
    round: number;
    player1_id: number | null;
    player2_id: number | null;
    state: "pending" | "open" | "complete";
    winner_id: number | null;
    scheduled_time: string | null;
  };
};

/** Accepts "my_tourney", "subdomain-my_tourney", or a challonge.com URL. */
export function tournamentIdFrom(input: string) {
  const s = input.trim();
  try {
    const u = new URL(s);
    const slug = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const sub = u.hostname.split(".")[0];
    return sub && sub !== "challonge" && sub !== "www" ? `${sub}-${slug}` : slug;
  } catch {
    return s;
  }
}

async function get<T>(path: string): Promise<T> {
  const key = process.env.CHALLONGE_API_KEY;
  if (!key) throw new Error("CHALLONGE_API_KEY is not set.");
  const url = new URL(`https://api.challonge.com/v1/tournaments/${path}`);
  url.searchParams.set("api_key", key);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Challonge returned ${res.status}. Check the tournament ID and API key.`);
  return res.json() as Promise<T>;
}

/** Pull teams and bracket matches from Challonge into the database. */
export async function syncChallonge(tournament: string) {
  const id = encodeURIComponent(tournamentIdFrom(tournament));
  const [participants, matches] = await Promise.all([
    get<CParticipant[]>(`${id}/participants.json`),
    get<CMatch[]>(`${id}/matches.json`),
  ]);
  const db = supabaseAdmin();
  const season = await currentSeason();

  // Teams: match by name within the current season so imported/hand-made teams are reused.
  const { data: teams, error: tErr } = await db
    .from("teams")
    .upsert(
      participants.map(({ participant: p }) => ({
        name: (p.display_name || p.name).trim(),
        challonge_participant_id: p.id,
        season_id: season.id,
      })),
      { onConflict: "season_id,name" },
    )
    .select("id, challonge_participant_id");
  if (tErr) throw new Error(tErr.message);

  // Group-stage matches reference group_player_ids, so map those too.
  const teamByCid = new Map<number, string>();
  for (const { participant: p } of participants) {
    const team = teams!.find((t) => t.challonge_participant_id === p.id);
    if (!team) continue;
    teamByCid.set(p.id, team.id);
    p.group_player_ids?.forEach((g) => teamByCid.set(g, team.id));
  }

  const ready = matches
    .map((m) => m.match)
    .filter((m) => m.player1_id && m.player2_id)
    .map((m) => ({
      m,
      row: {
        season_id: season.id,
        challonge_match_id: m.id,
        round_label: m.round > 0 ? `Round ${m.round}` : `Losers Round ${-m.round}`,
        team_a_id: teamByCid.get(m.player1_id!)!,
        team_b_id: teamByCid.get(m.player2_id!)!,
        scheduled_at: m.scheduled_time,
      },
    }))
    .filter(({ row }) => row.team_a_id && row.team_b_id);

  // Only overwrite status/winner for matches Challonge says are finished,
  // so results entered here aren't reset by a pending bracket.
  const done = ready
    .filter(({ m }) => m.state === "complete")
    .map(({ m, row }) => ({
      ...row,
      status: "completed",
      winner_team_id: m.winner_id ? teamByCid.get(m.winner_id) ?? null : null,
    }));
  const open = ready.filter(({ m }) => m.state !== "complete").map(({ row }) => row);

  for (const rows of [done, open]) {
    if (!rows.length) continue;
    const { error } = await db.from("matches").upsert(rows, { onConflict: "challonge_match_id" });
    if (error) throw new Error(error.message);
  }
  return { teams: participants.length, matches: ready.length };
}
