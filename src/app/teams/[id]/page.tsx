import Link from "next/link";
import { notFound } from "next/navigation";
import { RankLabel } from "@/components/Icons";
import MatchList from "@/components/MatchList";
import { pct, teamMap } from "@/lib/data";
import { rankOrder } from "@/lib/henrik";
import { currentRanks } from "@/lib/ranks";
import { rankIcons } from "@/lib/valorant-assets";
import { standings } from "@/lib/standings";
import { supabasePublic } from "@/lib/supabase";
import type { Career, Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = supabasePublic();
  const teams = await teamMap();
  const team = teams.get(id);
  if (!team) notFound();
  const [table, ranks, rankPng, { data: roster }, { data: matches }] = await Promise.all([
    standings(team.season_id ?? ""),
    currentRanks(),
    rankIcons(),
    db.from("player_season_career").select("*").eq("team_id", id).order("kd", { ascending: false, nullsFirst: false }),
    db.from("matches").select("*").or(`team_a_id.eq.${id},team_b_id.eq.${id}`)
      .order("scheduled_at", { ascending: false, nullsFirst: false }),
  ]);
  // Rank within the team's group (Group A / B), like the standings page.
  const groupTable = table.filter((r) => (r.team.group_name ?? "") === (team.group_name ?? ""));
  const rank = groupTable.findIndex((r) => r.team.id === id);
  const rec = groupTable[rank];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{team.name}</h1>
        {rec && (
          <p className="text-zinc-400">
            #{rank + 1}{team.group_name ? ` in ${team.group_name}` : ""} · {rec.wins}–{rec.losses} series · {rec.mapWins}–{rec.mapLosses} maps
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Roster</h2>
        <div className="card overflow-x-auto">
          <table className="stat-table">
            <thead><tr><th>Player</th><th className="!text-left">Rank</th><th>Maps</th><th>Win %</th><th>ACS</th><th>K/D</th><th>FB</th></tr></thead>
            <tbody>
              {/* Highest rank first; ties (and unranked) keep K/D order. */}
              {((roster ?? []) as Career[])
                .sort((a, b) => rankOrder(ranks.get(b.player_id)) - rankOrder(ranks.get(a.player_id)))
                .map((p) => (
                <tr key={p.player_id}>
                  <td>
                    <Link href={`/players/${p.player_id}`} className="hover:text-rose-400">{p.riot_name}</Link>
                    {p.is_captain && <span className="ml-1 text-xs text-amber-400">C</span>}
                  </td>
                  <td className="!text-left"><RankLabel tier={ranks.get(p.player_id)} icons={rankPng} /></td>
                  <td>{p.maps}</td><td>{pct(p.wins, p.maps)}</td><td>{p.avg_acs ?? "–"}</td>
                  <td>{p.kd ?? "–"}</td><td>{p.first_bloods}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Matches</h2>
        <div className="card">
          <MatchList matches={(matches ?? []) as Match[]} teams={teams} />
        </div>
      </section>
    </div>
  );
}
