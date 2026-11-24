import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { getViewer } from "@/lib/auth";
import { fmtDate, kd, pct, teamMap } from "@/lib/data";
import { isStale, refreshPlayerRank, type PlayerRank } from "@/lib/ranks";
import { supabasePublic } from "@/lib/supabase";
import type { Career, MapResult } from "@/lib/types";
import { agentIcons, rankIcons } from "@/lib/valorant-assets";
import { AgentIcon, AgentLabel } from "@/components/Icons";
import { KdTrend, MapWinRates, type GamePoint, type MapRate } from "./Charts";
import RankCard from "./RankCard";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = supabasePublic();
  const [teams, viewer, agentPng, rankPng, { data: career }, { data: games }, { data: rank }] = await Promise.all([
    teamMap(),
    getViewer(),
    agentIcons(),
    rankIcons(),
    db.from("player_career").select("*").eq("player_id", id).maybeSingle<Career>(),
    db.from("player_map_results").select("*").eq("player_id", id).order("played_at", { ascending: false }),
    db.from("player_ranks").select("*").eq("player_id", id).maybeSingle<PlayerRank>(),
  ]);
  if (!career) notFound();
  const history = (games ?? []) as MapResult[];

  // Keep ranks fresh without a scheduler: if this one is old, refresh it after
  // the page is sent. The next visit shows the new rank.
  if (career.riot_tag && process.env.HENRIKDEV_API_KEY && isStale(rank ?? null)) {
    after(() => refreshPlayerRank(id).catch((e) => console.error("rank refresh failed", e)));
  }

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
  const sum = (xs: MapResult[], k: "kills" | "deaths") => xs.reduce((s, g) => s + g[k], 0);
  const mains = [...agents.entries()]
    .filter(([name]) => name !== "Unknown")
    .sort((a, b) => b[1].maps - a[1].maps || b[1].k - a[1].k)
    .slice(0, 3);

  // Chart data: maps oldest → newest, and record per map name.
  const trend: GamePoint[] = [...history].reverse().map((g) => ({
    date: fmtDate(g.played_at).replace(/, \d{4}$/, ""),
    map: g.map_name ?? `Map ${g.map_number}`,
    opponent: teams.get(g.opponent_team_id)?.name ?? "?",
    agent: g.agent,
    kills: g.kills, deaths: g.deaths, assists: g.assists,
    won: g.won, score: `${g.rounds_won}–${g.rounds_lost}`,
  }));
  const byMap = new Map<string, MapRate>();
  for (const g of history) {
    const name = g.map_name ?? "Unknown";
    const r = byMap.get(name) ?? { map: name, maps: 0, wins: 0, kills: 0, deaths: 0 };
    r.maps++; if (g.won) r.wins++; r.kills += g.kills; r.deaths += g.deaths;
    byMap.set(name, r);
  }
  const mapRates = [...byMap.values()].sort((a, b) => b.maps - a.maps || b.wins / b.maps - a.wins / a.maps);

  const tiles: [string, string | number][] = [
    ["Maps", career.maps],
    ["Win rate", pct(career.wins, career.maps)],
    ["K/D", career.kd ?? "–"],
    ["Last 5 K/D", last5.length ? kd(sum(last5, "kills"), sum(last5, "deaths")) : "–"],
    ["Kills / map", career.maps ? (career.kills / career.maps).toFixed(1) : "–"],
    ["First bloods", career.first_bloods],
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">
            {career.riot_name}
            {career.riot_tag && <span className="font-normal text-zinc-500">#{career.riot_tag}</span>}
          </h1>
          <p className="text-zinc-400">
            {career.team_id ? (
              <Link href={`/teams/${career.team_id}`} className="hover:text-white">{teams.get(career.team_id)?.name}</Link>
            ) : "Free agent"}
            {career.is_captain && " · Captain"}
          </p>
        </div>
        <RankCard rank={rank ?? null} playerId={id} hasTag={!!career.riot_tag} isAdmin={!!viewer?.isAdmin} icons={rankPng} />
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">IM mains</h2>
        {mains.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {mains.map(([name, a], i) => (
              <div key={name} className="card p-4">
                <div className="flex items-center gap-3">
                  <AgentIcon name={name} icons={agentPng} size={56} />
                  <div>
                    <div className="text-xs text-zinc-500">#{i + 1}</div>
                    <div className="text-xl font-semibold">{name}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-sm tabular-nums text-zinc-400">
                  <span><span className="text-lg font-semibold text-zinc-100">{kd(a.k, a.d)}</span> K/D</span>
                  <span>{a.maps} {a.maps === 1 ? "map" : "maps"}</span>
                  <span>{pct(a.wins, a.maps)} W</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No agents recorded in IM games yet.</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="card p-3">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <h2 className="font-semibold">K/D by map</h2>
            <p className="mb-2 text-xs text-zinc-500">Each IM map, oldest to newest. Dashed line = 1.0 K/D. Hover a point for details.</p>
            <KdTrend games={trend} />
          </div>
          <div className="card p-4">
            <h2 className="font-semibold">Win rate by map</h2>
            <p className="mb-4 text-xs text-zinc-500">Record on each map in IM games.</p>
            <MapWinRates rows={mapRates} />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">All IM agents</h2>
        <div className="card overflow-x-auto">
          <table className="stat-table">
            <thead><tr><th>Agent</th><th>Maps</th><th>Win %</th><th>ACS</th><th>K/D</th></tr></thead>
            <tbody>
              {[...agents.entries()].sort((a, b) => b[1].maps - a[1].maps).map(([name, a]) => (
                <tr key={name}>
                  <td><AgentLabel name={name === "Unknown" ? null : name} icons={agentPng} /></td><td>{a.maps}</td><td>{pct(a.wins, a.maps)}</td>
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
                  <td className="!text-left"><AgentLabel name={g.agent} icons={agentPng} size={22} /></td>
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
