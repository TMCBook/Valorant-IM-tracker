// HenrikDev unofficial Valorant API: ranked info (MMR v3).
// Docs: https://docs.henrikdev.xyz  ·  Server only (uses HENRIKDEV_API_KEY).

const BASE = "https://api.henrikdev.xyz";

type Tier = { id: number; name: string };
type MmrV3 = {
  account: { name: string; tag: string; puuid: string };
  current: { tier: Tier; rr: number } | null;
  peak: { season: { id: string; short: string }; tier: Tier; rr: number } | null;
};

export type RankResult =
  | {
      status: "ok" | "unranked";
      puuid: string;
      name: string;
      tag: string;
      current: { tier: string; tierId: number; rr: number } | null;
      peak: { tier: string; tierId: number; rr: number; season: string } | null;
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
  const rankedTier = (t?: Tier | null) => (t && t.id > 2 ? t : null); // ids 0–2 = unranked
  const cur = rankedTier(d.current?.tier);
  const peak = rankedTier(d.peak?.tier);
  return {
    status: cur || peak ? "ok" : "unranked",
    puuid: d.account.puuid,
    name: d.account.name,
    tag: d.account.tag,
    current: cur ? { tier: cur.name, tierId: cur.id, rr: d.current!.rr } : null,
    peak: peak ? { tier: peak.name, tierId: peak.id, rr: d.peak!.rr, season: d.peak!.season.short } : null,
  };
}
