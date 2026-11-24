import Link from "next/link";
import { AgentIcon } from "@/components/Icons";
import { fmtDate, kd, teamMap } from "@/lib/data";
import { supabasePublic } from "@/lib/supabase";
import type { MapResult, Team } from "@/lib/types";
import { agentIcons } from "@/lib/valorant-assets";

export const dynamic = "force-dynamic";

/** Rate-based boards (K/D, win %, per-map) only include players with at least this many maps. */
const MIN_MAPS = 3;
const TOP = 5;

type Totals = {
  id: string; name: string; team: string | null;
  maps: number; wins: number; k: number; d: number; a: number; fb: number; plants: number; defuses: number;
};
type Entry = { id: string; name: string; team: string | null; value: string; detail?: string; href?: string };

export default async function LeaderboardsPage() {
  const db = supabasePublic();
  const [teams, icons, { data: lines }, { data: players }] = await Promise.all([
    teamMap(),
    agentIcons(),
    db.from("player_map_results").select("*").not("player_id", "is", null), // subs excluded
    db.from("players").select("id, riot_name, team_id"),
  ]);
  const games = (lines ?? []) as MapResult[];
  const who = new Map((players ?? []).map((p) => [p.id as string, p as { id: string; riot_name: string; team_id: string | null }]));
  const teamName = (id: string | null | undefined) => (id ? (teams.get(id) as Team | undefined)?.name ?? null : null);

  // ---- Per-player totals ----
  const totals = new Map<string, Totals>();
  for (const g of games) {
    const p = who.get(g.player_id!);
    if (!p) continue;
    const t = totals.get(p.id) ?? { id: p.id, name: p.riot_name, team: teamName(p.team_id), maps: 0, wins: 0, k: 0, d: 0, a: 0, fb: 0, plants: 0, defuses: 0 };
    t.maps++;
    if (g.won) t.wins++;
    t.k += g.kills; t.d += g.deaths; t.a += g.assists;
    t.fb += g.first_bloods ?? 0; t.plants += g.plants ?? 0; t.defuses += g.defuses ?? 0;
    totals.set(p.id, t);
  }
  const all = [...totals.values()];
  const qualified = all.filter((t) => t.maps >= MIN_MAPS);
  const board = (rows: Totals[], score: (t: Totals) => number, show: (t: Totals) => string, detail?: (t: Totals) => string): Entry[] =>
    [...rows]
      .sort((a, b) => score(b) - score(a) || b.maps - a.maps)
      .slice(0, TOP)
      .map((t) => ({ id: t.id, name: t.name, team: t.team, value: show(t), detail: detail?.(t), href: `/players/${t.id}` }));
  const ratio = (t: Totals) => t.k / Math.max(1, t.d);
  const perMap = (n: number, t: Totals) => n / t.maps;

  const boards: { title: string; note?: string; entries: Entry[] }[] = [
    { title: "K/D", note: `${MIN_MAPS}+ maps`, entries: board(qualified, ratio, (t) => kd(t.k, t.d), (t) => `${t.k}/${t.d}`) },
    { title: "Kills per map", note: `${MIN_MAPS}+ maps`, entries: board(qualified, (t) => perMap(t.k, t), (t) => perMap(t.k, t).toFixed(1), (t) => `${t.maps} maps`) },
    { title: "First bloods per map", note: `${MIN_MAPS}+ maps`, entries: board(qualified, (t) => perMap(t.fb, t), (t) => perMap(t.fb, t).toFixed(2), (t) => `${t.fb} total`) },
    { title: "Win rate", note: `${MIN_MAPS}+ maps`, entries: board(qualified, (t) => t.wins / t.maps, (t) => `${Math.round((100 * t.wins) / t.maps)}%`, (t) => `${t.wins}–${t.maps - t.wins}`) },
    { title: "Most first bloods", entries: board(all, (t) => t.fb, (t) => String(t.fb)) },
    { title: "Most assists", entries: board(all, (t) => t.a, (t) => String(t.a)) },
    { title: "Most plants", entries: board(all, (t) => t.plants, (t) => String(t.plants)) },
    { title: "Most defuses", entries: board(all, (t) => t.defuses, (t) => String(t.defuses)) },
  ];

  // ---- Single-map records ----
  const record = (score: (g: MapResult) => number, show: (g: MapResult) => string): Entry[] =>
    [...games]
      .sort((a, b) => score(b) - score(a))
      .slice(0, TOP)
      .map((g) => {
        const p = who.get(g.player_id!)!;
        return {
          id: g.id, name: p.riot_name, team: teamName(p.team_id), value: show(g),
          detail: `${g.map_name ?? "Map"} vs ${teamName(g.opponent_team_id) ?? "?"} · ${fmtDate(g.played_at)}`,
          href: `/matches/${g.match_id}`,
        };
      });
  const records = [
    { title: "Most kills in a map", entries: record((g) => g.kills, (g) => `${g.kills} kills`) },
    { title: "Best K/D in a map", note: "10+ kills", entries: record((g) => (g.kills >= 10 ? g.kills / Math.max(1, g.deaths) : -1), (g) => `${kd(g.kills, g.deaths)} (${g.kills}/${g.deaths})`) },
  ];

  // ---- Best player on each agent (2+ maps on that agent) ----
  const perAgent = new Map<string, Map<string, { k: number; d: number; maps: number }>>();
  for (const g of games) {
    if (!g.agent || !g.player_id) continue;
    const byPlayer = perAgent.get(g.agent) ?? new Map();
    const s = byPlayer.get(g.player_id) ?? { k: 0, d: 0, maps: 0 };
    s.k += g.kills; s.d += g.deaths; s.maps++;
    byPlayer.set(g.player_id, s);
    perAgent.set(g.agent, byPlayer);
  }
  const agentLeaders = [...perAgent]
    .map(([agent, byPlayer]) => {
      const picks = [...byPlayer].filter(([, s]) => s.maps >= 2);
      if (!picks.length) return null;
      const [pid, s] = picks.sort((a, b) => b[1].k / Math.max(1, b[1].d) - a[1].k / Math.max(1, a[1].d))[0];
      const totalMaps = [...byPlayer.values()].reduce((n, x) => n + x.maps, 0);
      return { agent, pid, name: who.get(pid)!.riot_name, kd: kd(s.k, s.d), maps: s.maps, totalMaps };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.totalMaps - a.totalMaps);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Leaderboards</h1>
        <p className="text-sm text-zinc-400">IM games only. Subs aren&apos;t ranked. Rate boards need {MIN_MAPS}+ maps.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {boards.map((b) => <Board key={b.title} {...b} />)}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Single-map records</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {records.map((b) => <Board key={b.title} {...b} />)}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Best on each agent <span className="text-sm font-normal text-zinc-500">(2+ maps on that agent)</span></h2>
        <div className="card overflow-x-auto">
          <table className="stat-table">
            <thead><tr><th>Agent</th><th className="!text-left">Best player</th><th>K/D</th><th>Their maps</th><th>Agent maps (league)</th></tr></thead>
            <tbody>
              {agentLeaders.map((a) => (
                <tr key={a.agent}>
                  <td><span className="inline-flex items-center gap-2"><AgentIcon name={a.agent} icons={icons} size={24} />{a.agent}</span></td>
                  <td className="!text-left"><Link href={`/players/${a.pid}`} className="hover:text-rose-400">{a.name}</Link></td>
                  <td className="font-semibold">{a.kd}</td>
                  <td>{a.maps}</td>
                  <td className="text-zinc-500">{a.totalMaps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Board({ title, note, entries }: { title: string; note?: string; entries: Entry[] }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {note && <span className="text-xs text-zinc-500">{note}</span>}
      </div>
      {entries.length ? (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li key={e.id + i} className="flex items-center gap-3 text-sm">
              <span className={`w-5 text-right tabular-nums ${i === 0 ? "font-bold text-amber-300" : "text-zinc-500"}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={e.href ?? "#"} className="block truncate font-medium hover:text-rose-400">{e.name}</Link>
                <div className="truncate text-xs text-zinc-500">{e.detail ? `${e.team ?? ""}${e.team ? " · " : ""}${e.detail}` : e.team}</div>
              </div>
              <span className="tabular-nums font-semibold">{e.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500">Not enough games yet.</p>
      )}
    </div>
  );
}
