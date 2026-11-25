import { AgentIcon } from "@/components/Icons";
import { fmtDate, kd, teamMap } from "@/lib/data";
import { NO_SEASON, seasonContext, seasonRoster } from "@/lib/season";
import { supabasePublic } from "@/lib/supabase";
import type { MapResult, Team } from "@/lib/types";
import { agentIcons } from "@/lib/valorant-assets";
import { Board, BreakdownTable, type Breakdown, type Entry, type RankRow } from "./Expandable";

export const dynamic = "force-dynamic";

/** Rate-based boards (K/D, win %, per-map) only rank players with at least this many maps. */
const MIN_MAPS = 3;
/** Best-on-a-map / best-on-an-agent needs this many maps on that map or agent. */
const MIN_SPLIT_MAPS = 2;
/** Single-map record lists keep this many entries when expanded. */
const RECORDS_KEPT = 50;

type Totals = {
  id: string; name: string; team: string | null;
  maps: number; wins: number; k: number; d: number; a: number; fb: number; plants: number; defuses: number;
};
const empty = (id: string, name: string, team: string | null): Totals =>
  ({ id, name, team, maps: 0, wins: 0, k: 0, d: 0, a: 0, fb: 0, plants: 0, defuses: 0 });
function add(t: Totals, g: MapResult) {
  t.maps++;
  if (g.won) t.wins++;
  t.k += g.kills; t.d += g.deaths; t.a += g.assists;
  t.fb += g.first_bloods ?? 0; t.plants += g.plants ?? 0; t.defuses += g.defuses ?? 0;
}
const ratio = (t: Totals) => t.k / Math.max(1, t.d);

export default async function LeaderboardsPage() {
  const db = supabasePublic();
  const season = (await seasonContext()).selected;
  const sid = season?.id ?? NO_SEASON;
  const [teams, icons, roster, { data: lines }, { data: players }] = await Promise.all([
    teamMap(),
    agentIcons(),
    seasonRoster(sid),
    db.from("player_map_results").select("*").eq("season_id", sid).not("player_id", "is", null), // this season; subs excluded
    db.from("players").select("id, riot_name"),
  ]);
  const games = (lines ?? []) as MapResult[];
  const name = new Map((players ?? []).map((p) => [p.id as string, p.riot_name as string]));
  // Team shown next to each name = the team they were rostered on that season.
  const teamOf = (pid: string) => {
    const tid = roster.get(pid);
    return tid ? (teams.get(tid) as Team | undefined)?.name ?? null : null;
  };
  const teamName = (tid: string | null | undefined) => (tid ? (teams.get(tid) as Team | undefined)?.name ?? null : null);

  // ---- Per-player totals ----
  const totals = new Map<string, Totals>();
  for (const g of games) {
    const pid = g.player_id!;
    if (!name.has(pid)) continue;
    const t = totals.get(pid) ?? empty(pid, name.get(pid)!, teamOf(pid));
    add(t, g);
    totals.set(pid, t);
  }
  const all = [...totals.values()];
  const qualified = all.filter((t) => t.maps >= MIN_MAPS);
  const board = (rows: Totals[], score: (t: Totals) => number, show: (t: Totals) => string, detail?: (t: Totals) => string): Entry[] =>
    [...rows]
      .sort((a, b) => score(b) - score(a) || b.maps - a.maps)
      .map((t) => ({ id: t.id, name: t.name, team: t.team, value: show(t), detail: detail?.(t), href: `/players/${t.id}` }));
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
      .filter((g) => score(g) >= 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, RECORDS_KEPT)
      .map((g) => ({
        id: g.id, name: name.get(g.player_id!) ?? "?", team: teamOf(g.player_id!), value: show(g),
        detail: `${g.map_name ?? "Map"} vs ${teamName(g.opponent_team_id) ?? "?"} · ${fmtDate(g.played_at)}`,
        href: `/matches/${g.match_id}`,
      }));
  const records = [
    { title: "Most kills in a map", entries: record((g) => g.kills, (g) => `${g.kills} kills`) },
    { title: "Best K/D in a map", note: "10+ kills", entries: record((g) => (g.kills >= 10 ? g.kills / Math.max(1, g.deaths) : -1), (g) => `${kd(g.kills, g.deaths)} (${g.kills}/${g.deaths})`) },
  ];

  // ---- Per map and per agent: everyone's stats, leader = best K/D with enough maps ----
  function breakdown(keyOf: (g: MapResult) => string | null, label: (key: string) => React.ReactNode): Breakdown[] {
    const groups = new Map<string, Map<string, Totals>>();
    for (const g of games) {
      const key = keyOf(g);
      const pid = g.player_id!;
      if (!key || !name.has(pid)) continue;
      const byPlayer = groups.get(key) ?? new Map<string, Totals>();
      const t = byPlayer.get(pid) ?? empty(pid, name.get(pid)!, teamOf(pid));
      add(t, g);
      byPlayer.set(pid, t);
      groups.set(key, byPlayer);
    }
    return [...groups].map(([key, byPlayer]) => {
      const people = [...byPlayer.values()];
      // Qualified players first (by K/D), then the rest (also by K/D), greyed out in the table.
      const ranked = people.sort(
        (a, b) => Number(b.maps >= MIN_SPLIT_MAPS) - Number(a.maps >= MIN_SPLIT_MAPS) || ratio(b) - ratio(a) || b.maps - a.maps,
      );
      const row = (t: Totals): RankRow => ({
        id: t.id, name: t.name, team: t.team, maps: t.maps, kd: kd(t.k, t.d),
        kpm: (t.k / t.maps).toFixed(1), winPct: `${Math.round((100 * t.wins) / t.maps)}%`, fb: t.fb,
      });
      const leader = ranked[0] && ranked[0].maps >= MIN_SPLIT_MAPS ? row(ranked[0]) : null;
      return {
        key,
        label: label(key),
        totalMaps: people.reduce((n, t) => n + t.maps, 0),
        leader,
        ranking: ranked.map(row),
        minMaps: MIN_SPLIT_MAPS,
      };
    })
      // Only list a map/agent once someone qualifies for the top spot on it.
      .filter((b) => b.leader)
      .sort((a, b) => b.totalMaps - a.totalMaps);
  }
  const byAgent = breakdown(
    (g) => g.agent,
    (agent) => <span className="inline-flex items-center gap-2"><AgentIcon name={agent} icons={icons} size={24} />{agent}</span>,
  );
  // Each map name counts once per player-map, so totals are "player maps", not unique games.
  const byMap = breakdown((g) => g.map_name, (map) => <span className="font-medium">{map}</span>);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Leaderboards{season ? <span className="ml-2 text-base font-normal text-zinc-500">{season.name}</span> : null}</h1>
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
        <div>
          <h2 className="text-lg font-semibold">Best on each map</h2>
          <p className="text-sm text-zinc-500">Highest K/D with {MIN_SPLIT_MAPS}+ maps on that map. Click a map to see everyone.</p>
        </div>
        <BreakdownTable firstColumn="Map" rows={byMap} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Best on each agent</h2>
          <p className="text-sm text-zinc-500">Highest K/D with {MIN_SPLIT_MAPS}+ maps on that agent. Click an agent to see its full leaderboard.</p>
        </div>
        <BreakdownTable firstColumn="Agent" rows={byAgent} />
      </section>
    </div>
  );
}
