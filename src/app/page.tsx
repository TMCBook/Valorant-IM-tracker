import Link from "next/link";
import MatchList from "@/components/MatchList";
import { teamMap } from "@/lib/data";
import { supabasePublic } from "@/lib/supabase";
import type { Career, Match, MatchMap } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <p>Set up <code>.env.local</code> first. See the README.</p>;
  }
  const db = supabasePublic();
  const [teams, recent, upcoming, leaders] = await Promise.all([
    teamMap(),
    db.from("matches").select("*").eq("status", "completed").order("scheduled_at", { ascending: false, nullsFirst: false }).limit(10),
    db.from("matches").select("*").eq("status", "scheduled").order("scheduled_at", { ascending: true, nullsFirst: false }).limit(8),
    db.from("player_career").select("*").gte("maps", 2).order("kd", { ascending: false, nullsFirst: false }).limit(10),
  ]);

  const recentMatches = (recent.data ?? []) as Match[];
  const { data: maps } = recentMatches.length
    ? await db.from("match_maps").select("*").in("match_id", recentMatches.map((m) => m.id))
    : { data: [] };
  const mapWins = new Map<string, [number, number]>();
  for (const m of (maps ?? []) as MatchMap[]) {
    const s = mapWins.get(m.match_id) ?? [0, 0];
    if (m.team_a_rounds > m.team_b_rounds) s[0]++;
    else if (m.team_b_rounds > m.team_a_rounds) s[1]++;
    mapWins.set(m.match_id, s);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <section className="space-y-3 lg:col-span-2">
        <h2 className="text-lg font-semibold">Recent results</h2>
        <div className="card">
          <MatchList matches={recentMatches} teams={teams} mapWins={mapWins} empty="No results uploaded yet." />
        </div>
        <h2 className="pt-4 text-lg font-semibold">Upcoming</h2>
        <div className="card">
          <MatchList matches={(upcoming.data ?? []) as Match[]} teams={teams} empty="Nothing scheduled." />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Top K/D <span className="text-xs font-normal text-zinc-500">(2+ maps)</span></h2>
        <div className="card">
          <table className="stat-table">
            <thead><tr><th>Player</th><th>Maps</th><th>K/D</th><th>FB</th></tr></thead>
            <tbody>
              {((leaders.data ?? []) as Career[]).map((p) => (
                <tr key={p.player_id}>
                  <td><Link href={`/players/${p.player_id}`} className="hover:text-rose-400">{p.riot_name}</Link></td>
                  <td>{p.maps}</td>
                  <td>{p.kd ?? "–"}</td>
                  <td>{p.first_bloods}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
