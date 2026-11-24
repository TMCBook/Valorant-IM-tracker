// HenrikDev unofficial Valorant API: ranked info (MMR v3).
// Docs: https://docs.henrikdev.xyz  ·  Server only (uses HENRIKDEV_API_KEY).

const BASE = "https://api.henrikdev.xyz";

type Tier = { id: number; name: string };
type Season = { id: string; short: string };
type MmrV3 = {
  account: { name: string; tag: string; puuid: string };
  current: { tier: Tier; rr: number } | null;
  peak: { season: Season; tier: Tier; rr: number } | null;
  seasonal?: { season: Season; end_tier: Tier | null; end_rr: number; act_wins?: Tier[] }[];
};

// Ranks in order, compared by NAME: Riot renumbered tiers when Ascendant was
// added (Episode 5), so an old "Immortal 3" has the same id as a new "Ascendant 3".
const DIVS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal"];
const ORDER = [...DIVS.flatMap((d) => [1, 2, 3].map((n) => `${d} ${n}`)), "Radiant"];
export const rankOrder = (name: string | null | undefined) => (name ? ORDER.indexOf(name) : -1);

/**
 * Highest rank ever reached, and the act it happened in. HenrikDev's own
 * "peak" field skips the current act, so we look at everything:
 * the current rank, each past act's final rank, and each act's win badges.
 * RR is only known when the peak is the current rank or an act's final rank.
 */
function computePeak(d: MmrV3, currentAct: string | null) {
  type Cand = { tier: Tier; rr: number | null; season: string | null; recent: number };
  const cands: Cand[] = [];
  const acts = d.seasonal ?? [];
  if (d.current?.tier) cands.push({ tier: d.current.tier, rr: d.current.rr, season: currentAct, recent: acts.length });
  acts.forEach((s, i) => {
    if (s.end_tier) cands.push({ tier: s.end_tier, rr: s.end_rr, season: s.season.short, recent: i });
    for (const w of s.act_wins ?? []) cands.push({ tier: w, rr: null, season: s.season.short, recent: i });
  });
  if (d.peak?.tier) cands.push({ tier: d.peak.tier, rr: d.peak.rr || null, season: d.peak.season.short, recent: -1 });
  let best: Cand | null = null;
  for (const c of cands) {
    const o = rankOrder(c.tier.name);
    if (o < 0) continue; // Unrated
    const bo = best ? rankOrder(best.tier.name) : -1;
    if (o > bo || (o === bo && (c.rr ?? -1) > (best!.rr ?? -1))) best = c;
  }
  return best;
}

export type RankResult =
  | {
      status: "ok" | "unranked";
      puuid: string;
      name: string;
      tag: string;
      current: { tier: string; tierId: number; rr: number } | null;
      peak: { tier: string; tierId: number; rr: number | null; season: string } | null;
    }
  | { status: "not_found" | "error"; error: string; retryAfterSec?: number };

/** Look a player up by permanent account id if known (survives renames), else by Riot ID. */
export async function fetchRank(opts: { puuid?: string | null; name: string; tag: string | null }): Promise<RankResult> {
  const key = process.env.HENRIKDEV_API_KEY;
  if (!key) return { status: "error", error: "HENRIKDEV_API_KEY is not set." };
  const region = process.env.HENRIKDEV_REGION || "na";
  const enc = encodeURIComponent;

  let path: string;
  if (opts.puuid) path = `/valorant/v3/by-puuid/mmr/${region}/pc/${enc(opts.puuid)}`;
  else if (opts.tag) path = `/valorant/v3/mmr/${region}/pc/${enc(opts.name)}/${enc(opts.tag)}`;
  else return { status: "not_found", error: "No #tag saved for this player." };

  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { Authorization: key }, cache: "no-store" });
  } catch (e) {
    return { status: "error", error: `Network error: ${(e as Error).message}` };
  }
  const body = await res.json().catch(() => null);

  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset") ?? 60);
    return { status: "error", error: "Rate limited by HenrikDev.", retryAfterSec: Number.isFinite(retry) ? retry : 60 };
  }
  if (!res.ok) {
    const code = body?.errors?.[0]?.code;
    const msg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    if (res.status === 404 && code === 25) return { status: "not_found", error: "No ranked data for this account." };
    if (res.status === 404) return { status: "not_found", error: msg };
    return { status: "error", error: msg };
  }

  const d = body?.data as MmrV3 | undefined;
  if (!d?.account) return { status: "error", error: "Unexpected response from HenrikDev." };
  const cur = d.current?.tier && rankOrder(d.current.tier.name) >= 0 ? d.current.tier : null;
  const acts = d.seasonal ?? [];
  const peak = computePeak(d, acts.length ? acts[acts.length - 1].season.short : null);
  return {
    status: cur || peak ? "ok" : "unranked",
    puuid: d.account.puuid,
    name: d.account.name,
    tag: d.account.tag,
    current: cur ? { tier: cur.name, tierId: cur.id, rr: d.current!.rr } : null,
    peak: peak ? { tier: peak.tier.name, tierId: peak.tier.id, rr: peak.rr, season: peak.season ?? "" } : null,
  };
}
