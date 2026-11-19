import Link from "next/link";
import { fmtDate } from "@/lib/data";
import type { Match, Team } from "@/lib/types";

export default function MatchList({
  matches,
  teams,
  mapWins,
  empty = "No matches yet.",
}: {
  matches: Match[];
  teams: Map<string, Team>;
  mapWins?: Map<string, [number, number]>;
  empty?: string;
}) {
  if (!matches.length) return <p className="px-3 py-3 text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y divide-zinc-800">
      {matches.map((m) => {
        const score = mapWins?.get(m.id);
        const name = (id: string) => (
          <span className={m.winner_team_id === id ? "font-semibold text-white" : "text-zinc-300"}>
            {teams.get(id)?.name ?? "?"}
          </span>
        );
        return (
          <li key={m.id}>
            <Link href={`/matches/${m.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-900">
              <span className="flex-1">
                {name(m.team_a_id)} <span className="text-zinc-500">vs</span> {name(m.team_b_id)}
              </span>
              {score && (score[0] || score[1]) ? (
                <span className="tabular-nums text-zinc-300">{score[0]}–{score[1]}</span>
              ) : null}
              <span className="w-28 text-right text-xs text-zinc-500">
                {m.round_label ?? ""}
                <br />
                {fmtDate(m.scheduled_at ?? m.created_at)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
