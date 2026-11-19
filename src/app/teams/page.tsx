import Link from "next/link";
import { standings } from "@/lib/standings";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const rows = await standings();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Standings</h1>
      <div className="card overflow-x-auto">
        <table className="stat-table">
          <thead>
            <tr><th>#</th><th className="!text-left">Team</th><th>Series W–L</th><th>Maps W–L</th><th>Round diff</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
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
        {!rows.length && <p className="p-4 text-sm text-zinc-500">No teams yet. An admin can sync them from Challonge.</p>}
      </div>
    </div>
  );
}
