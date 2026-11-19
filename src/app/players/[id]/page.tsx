import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, kd, pct, teamMap } from "@/lib/data";
import { supabasePublic } from "@/lib/supabase";
import { riotId, type Career, type MapResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabasePublic();
  const [teams, { data: career }, { data: games }] = await Promise.all([
    teamMap(),
    db.from("player_career").select("*").eq("player_id", id).maybeSingle<Career>(),
    db.from("player_map_results").select("*").eq("player_id", id).order("played_at", { ascending: false }),
  ]);
  if (!career) notFound();
  const history = (games ?? []) as MapResult[];

  // Per-agent breakdown.
  const agents = new Map<string, { maps: number; wins: number; k: number; d: number; acs: number[] }>();
  for (const g of history) {
    const key = g.agent || "Unknown";
    const a = agents.get(key) ?? { maps: 0, wins: 0, k: 0, d: 0, acs: [] };
    a.maps++;
    if (g.won) a.wins++;
    a.k += g.kills;
    a.d += g.deaths;
    if (g.acs != null) a.acs.push(g.acs);
    agents.set(key, a);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const last5 = history.slice(0, 5);

  const tiles: [string, string | number][] = [
    ["Maps", career.maps],
    ["Win rate", pct(career.wins, career.maps)],
    ["Avg ACS", career.avg_acs ?? "–"],
    ["K/D", career.kd ?? "–"],
    ["Last 5 ACS", avg(last5.flatMap((g) => (g.acs == null ? [] : [g.acs]))) ?? "–"],
    ["First bloods", career.first_bloods],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{riotId(career)}</h1>
        <p className="text-zinc-400">
          {career.team_id ? (
            <Link href={`/teams/${career.team_id}`} className="hover:text-white">{teams.get(career.team_id)?.name}</Link>
          ) : "Free agent"}
          {career.is_captain && " · Captain"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="card p-3">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Agents</h2>
        <div className="card overflow-x-auto">
          <table className="stat-table">
            <thead><tr><th>Agent</th><th>Maps</th><th>Win %</th><th>ACS</th><th>K/D</th></tr></thead>
            <tbody>
              {[...agents.entries()].sort((a, b) => b[1].maps - a[1].maps).map(([name, a]) => (
                <tr key={name}>
                  <td>{name}</td><td>{a.maps}</td><td>{pct(a.wins, a.maps)}</td>
                  <td>{avg(a.acs) ?? "–"}</td><td>{kd(a.k, a.d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Match history</h2>
        <div className="card overflow-x-auto">
          <table className="stat-table">
            <thead>
              <tr>
                <th>Date</th><th className="!text-left">Opponent</th><th className="!text-left">Map</th>
                <th>Result</th><th className="!text-left">Agent</th><th>ACS</th><th>K / D / A</th>
                <th>Econ</th><th>FB</th><th>Pl</th><th>Df</th>
              </tr>
            </thead>
            <tbody>
              {history.map((g) => (
                <tr key={g.id}>
                  <td className="text-zinc-400">
                    <Link href={`/matches/${g.match_id}`} className="hover:text-white">{fmtDate(g.played_at)}</Link>
                  </td>
                  <td className="!text-left">{teams.get(g.opponent_team_id)?.name}</td>
                  <td className="!text-left">{g.map_name ?? `Map ${g.map_number}`}</td>
                  <td className={g.won ? "text-teal-400" : "text-red-400"}>
                    {g.won ? "W" : "L"} {g.rounds_won}–{g.rounds_lost}
                  </td>
                  <td className="!text-left">{g.agent ?? "–"}</td>
                  <td>{g.acs ?? "–"}</td>
                  <td>{g.kills} / {g.deaths} / {g.assists}</td>
                  <td>{g.econ ?? "–"}</td>
                  <td>{g.first_bloods ?? "–"}</td>
                  <td>{g.plants ?? "–"}</td>
                  <td>{g.defuses ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.length && <p className="p-4 text-sm text-zinc-500">No games recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
