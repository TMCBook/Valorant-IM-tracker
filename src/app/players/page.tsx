import Link from "next/link";
import { RankLabel } from "@/components/Icons";
import { pct, teamMap } from "@/lib/data";
import { rankOrder } from "@/lib/henrik";
import { currentRanks } from "@/lib/ranks";
import { NO_SEASON, seasonContext } from "@/lib/season";
import { supabasePublic } from "@/lib/supabase";
import type { Career } from "@/lib/types";
import { rankIcons } from "@/lib/valorant-assets";

export const dynamic = "force-dynamic";

const COLS = [
  ["rank", "Rank"],
  ["maps", "Maps"],
  ["wins", "Win %"],
  ["avg_acs", "ACS"],
  ["kd", "K/D"],
  ["kills", "K"],
  ["deaths", "D"],
  ["assists", "A"],
  ["first_bloods", "FB"],
  ["plants", "Plants"],
  ["defuses", "Defuses"],
] as const;
type SortKey = (typeof COLS)[number][0];

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: raw } = await searchParams;
  const sort: SortKey = COLS.some(([k]) => k === raw) ? (raw as SortKey) : "kd";
  // Rank isn't a database column of the stats view, so that sort happens below.
  const dbSort = sort === "rank" ? "kd" : sort;
  const sid = (await seasonContext()).selected?.id ?? NO_SEASON;
  const [teams, ranks, rankPng, { data }] = await Promise.all([
    teamMap(),
    currentRanks(),
    rankIcons(),
    supabasePublic()
      .from("player_season_career") // this season's roster and stats
      .select("*")
      .eq("season_id", sid)
      .order(dbSort, { ascending: dbSort === "deaths", nullsFirst: false })
      .order("riot_name"),
  ]);
  const players = (data ?? []) as Career[];
  if (sort === "rank") {
    players.sort((a, b) => rankOrder(ranks.get(b.player_id)) - rankOrder(ranks.get(a.player_id)));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Players</h1>
      <div className="card overflow-x-auto">
        <table className="stat-table">
          <thead>
            <tr>
              <th>Player</th>
              <th className="!text-left">Team</th>
              {COLS.map(([key, label]) => (
                <th key={key} className={key === "rank" ? "!text-left" : ""}>
                  <Link href={`?sort=${key}`} className={sort === key ? "text-rose-400" : "hover:text-white"}>
                    {label}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_id}>
                <td>
                  <Link href={`/players/${p.player_id}`} className="font-medium hover:text-rose-400">
                    {p.riot_name}
                  </Link>
                  {p.is_captain && <span className="ml-1 text-xs text-amber-400" title="Captain">C</span>}
                </td>
                <td className="!text-left text-zinc-400">
                  {p.team_id ? (
                    <Link href={`/teams/${p.team_id}`} className="hover:text-white">{teams.get(p.team_id)?.name}</Link>
                  ) : "–"}
                </td>
                <td className="!text-left"><RankLabel tier={ranks.get(p.player_id)} icons={rankPng} /></td>
                <td>{p.maps}</td>
                <td>{pct(p.wins, p.maps)}</td>
                <td>{p.avg_acs ?? "–"}</td>
                <td>{p.kd ?? "–"}</td>
                <td>{p.kills}</td>
                <td>{p.deaths}</td>
                <td>{p.assists}</td>
                <td>{p.first_bloods}</td>
                <td>{p.plants}</td>
                <td>{p.defuses}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!players.length && <p className="p-4 text-sm text-zinc-500">No players yet.</p>}
      </div>
    </div>
  );
}
