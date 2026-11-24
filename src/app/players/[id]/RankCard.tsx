import { formatSeason, isImmortalPlus, type PlayerRank } from "@/lib/ranks";
import RefreshRankButton from "./RefreshRankButton";

// Text color per rank family (Iron … Radiant).
const COLORS: [string, string][] = [
  ["iron", "text-zinc-400"], ["bronze", "text-amber-600"], ["silver", "text-zinc-200"],
  ["gold", "text-yellow-400"], ["platinum", "text-cyan-400"], ["diamond", "text-fuchsia-400"],
  ["ascendant", "text-emerald-400"], ["immortal", "text-rose-400"], ["radiant", "text-amber-200"],
];
const color = (tier: string | null) =>
  COLORS.find(([k]) => tier?.toLowerCase().startsWith(k))?.[1] ?? "text-zinc-300";

function ago(iso: string) {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default function RankCard({
  rank,
  playerId,
  hasTag,
  isAdmin,
}: {
  rank: PlayerRank | null;
  playerId: string;
  hasTag: boolean;
  isAdmin: boolean;
}) {
  let body: React.ReactNode;
  if (!rank) {
    body = <p className="text-sm text-zinc-500">{hasTag ? "Rank loads shortly. Refresh the page in a moment." : "Add this player's #tag to show their rank."}</p>;
  } else if (rank.status === "not_found") {
    body = <p className="text-sm text-zinc-500">Riot ID not found. It may have changed; an admin can update it.</p>;
  } else if (rank.status === "error") {
    body = <p className="text-sm text-zinc-500">Rank unavailable right now.</p>;
  } else {
    body = (
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Current</div>
          {rank.current_tier ? (
            <>
              <div className={`text-2xl font-bold ${color(rank.current_tier)}`}>{rank.current_tier}</div>
              <div className="text-sm tabular-nums text-zinc-400">{rank.current_rr} RR</div>
            </>
          ) : (
            <div className="text-2xl font-bold text-zinc-500">Unranked</div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Peak</div>
          {rank.peak_tier ? (
            <>
              <div className={`text-2xl font-bold ${color(rank.peak_tier)}`}>{rank.peak_tier}</div>
              <div className="text-sm text-zinc-400">
                {formatSeason(rank.peak_season)}
                {isImmortalPlus(rank.peak_tier) && rank.peak_rr != null && (
                  <span className="tabular-nums"> · {rank.peak_rr} RR</span>
                )}
              </div>
            </>
          ) : (
            <div className="text-2xl font-bold text-zinc-500">–</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card min-w-[280px] space-y-2 p-4">
      {body}
      <div className="flex items-center gap-3 text-xs text-zinc-600">
        {rank && <span>Updated {ago(rank.fetched_at)}</span>}
        {isAdmin && hasTag && <RefreshRankButton playerId={playerId} />}
      </div>
    </div>
  );
}
