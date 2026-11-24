import { formatSeason, isImmortalPlus, type PlayerRank } from "@/lib/ranks";
import { RankIcon } from "@/components/Icons";
import type { IconMap } from "@/lib/valorant-assets";
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
  icons,
}: {
  rank: PlayerRank | null;
  playerId: string;
  hasTag: boolean;
  isAdmin: boolean;
  icons: IconMap;
}) {
  let body: React.ReactNode;
  if (!rank) {
    body = <p className="text-sm text-zinc-500">{hasTag ? "Rank loads shortly. Refresh the page in a moment." : "Add this player's #tag to show their rank."}</p>;
  } else if (rank.status === "not_found") {
    body = <p className="text-sm text-zinc-500">Riot ID not found. It may have changed; an admin can update it.</p>;
  } else if (rank.status === "error") {
    body = <p className="text-sm text-zinc-500">Rank unavailable right now.</p>;
  } else {
    const slot = (label: string, tier: string | null, sub: React.ReactNode, empty: string) => (
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="mt-1 flex items-center gap-3">
          {tier ? <RankIcon tier={tier} icons={icons} size={56} /> : <div className="h-14 w-14 rounded-full bg-zinc-800" />}
          <div>
            <div className={`text-xl font-bold leading-tight ${tier ? color(tier) : "text-zinc-500"}`}>{tier ?? empty}</div>
            {tier && <div className="text-sm tabular-nums text-zinc-400">{sub}</div>}
          </div>
        </div>
      </div>
    );
    body = (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {slot("Current", rank.current_tier, `${rank.current_rr} RR`, "Unranked")}
        {slot(
          "Peak",
          rank.peak_tier,
          <>
            {formatSeason(rank.peak_season)}
            {isImmortalPlus(rank.peak_tier) && rank.peak_rr != null && <> · {rank.peak_rr} RR</>}
          </>,
          "–",
        )}
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
