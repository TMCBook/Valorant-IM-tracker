// Official agent and rank images, via valorant-api.com (free community API).
// The lists are cached by Next.js for a day; the images themselves load
// straight from media.valorant-api.com.

import "server-only";

export type IconMap = Record<string, string>;

/** "KAY/O", "kayo" and "Kay/O" all become "kayo". */
export const iconKey = (name: string | null | undefined) => (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const DAY = 86_400;

/** Agent name → portrait URL. */
export async function agentIcons(): Promise<IconMap> {
  try {
    const res = await fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true", { next: { revalidate: DAY } });
    const agents = (await res.json()).data as { displayName: string; displayIcon: string; displayIconSmall?: string }[];
    return Object.fromEntries(agents.map((a) => [iconKey(a.displayName), a.displayIconSmall || a.displayIcon]));
  } catch {
    return {}; // no icons: pages fall back to text only
  }
}

/** Rank name ("Immortal 1") → rank badge URL. Uses the current (post-Ascendant) set. */
export async function rankIcons(): Promise<IconMap> {
  try {
    const res = await fetch("https://valorant-api.com/v1/competitivetiers", { next: { revalidate: DAY } });
    const sets = (await res.json()).data as { tiers: { tierName: string; largeIcon: string | null }[] }[];
    const latest = sets[sets.length - 1];
    return Object.fromEntries(latest.tiers.filter((t) => t.largeIcon).map((t) => [iconKey(t.tierName), t.largeIcon!]));
  } catch {
    return {};
  }
}
