import Link from "next/link";
import { NO_SEASON, seasonContext } from "@/lib/season";
import { standings, type Standing } from "@/lib/standings";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const season = (await seasonContext()).selected;
  const rows = await standings(season?.id ?? NO_SEASON);

  // One table per group (Group A, Group B…); teams without a group share one table.
  const groups = new Map<string, Standing[]>();
  for (const r of rows) {
    const g = r.team.group_name?.trim() || "";
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const ordered = [...groups].sort(([a], [b]) => (a || "~").localeCompare(b || "~"));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Standings{season ? <span className="ml-2 text-base font-normal text-zinc-500">{season.name}</span> : null}</h1>
      {!rows.length && <p className="text-sm text-zinc-500">No teams this season yet. An admin can import the sign-up sheet.</p>}
      <div className={`grid gap-6 ${ordered.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {ordered.map(([group, teams]) => (
          <section key={group || "all"} className="space-y-2">
            {ordered.length > 1 && <h2 className="text-lg font-semibold">{group || "No group"}</h2>}
            <div className="card overflow-x-auto">
              <table className="stat-table">
                <thead>
                  <tr><th>#</th><th className="!text-left">Team</th><th>Series W–L</th><th>Maps W–L</th><th>Round diff</th></tr>
                </thead>
                <tbody>
                  {teams.map((r, i) => (
                    <tr key={r.team.id}>
                      <td className="text-zinc-500">{i + 1}</td>
                      <td className="!text-left">
                        <Link href={`/teams/${r.team.id}`} className="font-medium hover:text-rose-400">{r.team.name}</Link>
                      </td>
                      <td>{r.wins}–{r.losses}</td>
                      <td>{r.mapWins}–{r.mapLosses}</td>
                      <td className={r.roundDiff > 0 ? "text-teal-400" : r.roundDiff < 0 ? "text-red-400" : ""}>
                        {r.roundDiff > 0 ? "+" : ""}{r.roundDiff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
