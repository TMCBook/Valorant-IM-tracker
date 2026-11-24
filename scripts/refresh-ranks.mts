// Refresh every player's rank from HenrikDev.
//
//   npm run refresh-ranks            only players whose rank is missing or >12h old
//   npm run refresh-ranks -- --all   everyone
//
// Paced to stay under the basic key's ~30 requests/minute.

import { createClient } from "@supabase/supabase-js";
import { isStale, refreshPlayerRank, type PlayerRank } from "../src/lib/ranks";

const all = process.argv.includes("--all");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { data: players } = await db.from("players").select("id, riot_name, riot_tag").order("riot_name");
const { data: ranks } = await db.from("player_ranks").select("*");
const byId = new Map((ranks as PlayerRank[]).map((r) => [r.player_id, r]));
const todo = players!.filter((p) => all || isStale(byId.get(p.id) ?? null));
console.log(`Refreshing ${todo.length} of ${players!.length} players…\n`);

const counts: Record<string, number> = {};
for (const p of todo) {
  let r = await refreshPlayerRank(p.id);
  if (r.status === "error" && "retryAfterSec" in r && r.retryAfterSec) {
    console.log(`  rate limited, waiting ${r.retryAfterSec}s…`);
    await sleep(r.retryAfterSec * 1000);
    r = await refreshPlayerRank(p.id);
  }
  counts[r.status] = (counts[r.status] ?? 0) + 1;
  const label = `${p.riot_name}${p.riot_tag ? "#" + p.riot_tag : ""}`;
  if (r.status === "ok") {
    console.log(`  ${label}: ${r.current ? `${r.current.tier} ${r.current.rr}RR` : "unrated now"}, peak ${r.peak?.tier ?? "–"} (${r.peak?.season ?? "?"})`);
  } else {
    console.log(`  ${label}: ${r.status}${"error" in r ? ` – ${r.error}` : ""}`);
  }
  await sleep(2100);
}
console.log("\nDone:", counts);
