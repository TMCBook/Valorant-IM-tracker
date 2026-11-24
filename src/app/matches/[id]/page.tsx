import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { fmtDate } from "@/lib/data";
import { screenshotUrl, supabasePublic } from "@/lib/supabase";
import { riotId, type Match, type MatchMap, type Player, type StatLine, type Team } from "@/lib/types";
import { CompleteToggle, DeleteMapButton } from "./MatchControls";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabasePublic();
  const { data: match } = await db.from("matches").select("*").eq("id", id).maybeSingle<Match>();
  if (!match) notFound();

  const [viewer, { data: teamRows }, { data: mapRows }] = await Promise.all([
    getViewer(),
    db.from("teams").select("*").in("id", [match.team_a_id, match.team_b_id]),
    db.from("match_maps").select("*").eq("match_id", id).order("map_number"),
  ]);
  const maps = (mapRows ?? []) as MatchMap[];
  const { data: statRows } = maps.length
    ? await db.from("player_map_stats").select("*").in("match_map_id", maps.map((m) => m.id))
    : { data: [] };
  const stats = (statRows ?? []) as StatLine[];
  const playerIds = stats.flatMap((s) => (s.player_id ? [s.player_id] : [])); // subs have none
  const { data: playerRows } = playerIds.length
    ? await db.from("players").select("*").in("id", playerIds)
    : { data: [] };

  const teams = new Map(((teamRows ?? []) as Team[]).map((t) => [t.id, t]));
  const players = new Map(((playerRows ?? []) as Player[]).map((p) => [p.id, p]));
  const A = teams.get(match.team_a_id);
  const B = teams.get(match.team_b_id);
  const aMaps = maps.filter((m) => m.team_a_rounds > m.team_b_rounds).length;
  const bMaps = maps.filter((m) => m.team_b_rounds > m.team_a_rounds).length;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm text-zinc-500">
          {match.round_label ?? "Match"} · {fmtDate(match.scheduled_at ?? match.created_at)} ·{" "}
          {match.status === "completed" ? "Final" : "In progress / scheduled"}
        </p>
        <div className="flex items-center gap-4 text-2xl font-bold">
          <Link href={`/teams/${match.team_a_id}`} className={match.winner_team_id === match.team_a_id ? "text-white" : "text-zinc-400"}>{A?.name}</Link>
          <span className="tabular-nums">{aMaps} – {bMaps}</span>
          <Link href={`/teams/${match.team_b_id}`} className={match.winner_team_id === match.team_b_id ? "text-white" : "text-zinc-400"}>{B?.name}</Link>
        </div>
        {viewer?.canUpload && (
          <div className="flex gap-3 pt-2">
            <Link href={`/upload?match=${id}`} className="rounded bg-rose-600 px-3 py-1 text-sm font-semibold hover:bg-rose-500">
              Upload a map
            </Link>
            <CompleteToggle matchId={id} completed={match.status === "completed"} />
          </div>
        )}
      </div>

      {!maps.length && <p className="text-zinc-500">No maps uploaded yet.</p>}

      {maps.map((m) => {
        const lines = stats.filter((s) => s.match_map_id === m.id);
        const shot = screenshotUrl(m.screenshot_path);
        return (
          <section key={m.id} className="space-y-2">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold">Map {m.map_number}{m.map_name ? ` · ${m.map_name}` : ""}</h2>
              <span className="tabular-nums text-zinc-400">{m.team_a_rounds}–{m.team_b_rounds}</span>
              {shot && <a href={shot} target="_blank" className="text-xs text-zinc-500 underline hover:text-white">screenshot</a>}
              {viewer?.isAdmin && <span className="ml-auto"><DeleteMapButton mapId={m.id} /></span>}
            </div>
            {[match.team_a_id, match.team_b_id].map((teamId) => {
              const won = teamId === match.team_a_id ? m.team_a_rounds > m.team_b_rounds : m.team_b_rounds > m.team_a_rounds;
              const rows = lines.filter((s) => s.team_id === teamId).sort((x, y) => (y.acs ?? 0) - (x.acs ?? 0) || y.kills - x.kills);
              return (
                <div key={teamId} className="card overflow-x-auto">
                  <div className={`px-3 pt-2 text-sm font-semibold ${won ? "text-teal-400" : "text-red-400"}`}>
                    {teams.get(teamId)?.name} {won ? "· W" : "· L"}
                  </div>
                  <table className="stat-table">
                    <thead><tr><th>Player</th><th className="!text-left">Agent</th><th>ACS</th><th>K</th><th>D</th><th>A</th><th>+/-</th><th>Econ</th><th>FB</th><th>Pl</th><th>Df</th></tr></thead>
                    <tbody>
                      {rows.map((s) => {
                        const p = s.player_id ? players.get(s.player_id) : null;
                        const diff = s.kills - s.deaths;
                        return (
                          <tr key={s.id}>
                            <td>
                              {s.player_id ? (
                                <Link href={`/players/${s.player_id}`} className="hover:text-rose-400">{p ? riotId(p) : "?"}</Link>
                              ) : (
                                <span className="text-zinc-300">
                                  {s.sub_name}
                                  <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">sub</span>
                                </span>
                              )}
                            </td>
                            <td className="!text-left">{s.agent ?? "–"}</td>
                            <td>{s.acs ?? "–"}</td><td>{s.kills}</td><td>{s.deaths}</td><td>{s.assists}</td>
                            <td className={diff > 0 ? "text-teal-400" : diff < 0 ? "text-red-400" : ""}>{diff > 0 ? "+" : ""}{diff}</td>
                            <td>{s.econ ?? "–"}</td><td>{s.first_bloods ?? "–"}</td><td>{s.plants ?? "–"}</td><td>{s.defuses ?? "–"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
