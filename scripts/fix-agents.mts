// Re-identify agents on maps already in the database, using the template matcher.
//
//   npm run fix-agents             dry run: shows what would change
//   npm run fix-agents -- --commit write the changes
//
// For each saved map we download its screenshot, run the matcher, pair rows
// with players by name (using Claude's cached reading of that screenshot),
// and update each stat line's agent. Lines the matcher isn't sure about keep
// whatever they had.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchAgents, applyAgents } from "../src/lib/agents/match";
import { matchNames } from "../src/lib/names";
import type { ParsedScoreboard } from "../src/lib/scoreboard";

const commit = process.argv.includes("--commit");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: maps } = await db.from("match_maps").select("id, screenshot_path, map_name").not("screenshot_path", "is", null);
const tally = { fixed: 0, filled: 0, same: 0, unsure: 0, unmatched: 0, skippedMaps: 0 };
const updates: { id: string; agent: string }[] = [];

for (const m of maps!) {
  const { data: file } = await db.storage.from("scoreboards").download(m.screenshot_path!);
  if (!file) { tally.skippedMaps++; continue; }
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 16);
  const cache = join(".import-cache", `${hash}.json`);
  const rows = await matchAgents(bytes);
  if (!rows || !existsSync(cache)) { tally.skippedMaps++; console.log(`  skip ${m.screenshot_path}: ${rows ? "no cached reading" : "layout not recognized"}`); continue; }
  const parsed = applyAgents(JSON.parse(readFileSync(cache, "utf8")) as ParsedScoreboard, rows);

  // This map's stat lines with their player names.
  const { data: lines } = await db
    .from("player_map_stats")
    .select("id, agent, sub_name, players(riot_name)")
    .eq("match_map_id", m.id);
  const named = lines!.map((l) => ({ id: l.id, agent: l.agent as string | null, riot_name: (l.players as unknown as { riot_name: string } | null)?.riot_name ?? (l.sub_name as string) }));
  // Pair screenshot names with stat lines (each line used at most once).
  const pairs = matchNames(parsed.players.map((p) => p.name), named);

  const seen = new Set<string>();
  parsed.players.forEach((p, i) => {
    const line = pairs[i];
    if (!line) return; // a sub we didn't record
    seen.add(line.id);
    if (!p.agent) { tally.unsure++; return; }
    if (p.agent === line.agent) { tally.same++; return; }
    if (line.agent) {
      tally.fixed++;
      console.log(`  ${m.map_name ?? "?"}: ${line.riot_name.padEnd(16)} ${line.agent} → ${p.agent}`);
    } else tally.filled++;
    updates.push({ id: line.id, agent: p.agent });
  });
  tally.unmatched += named.filter((l) => !seen.has(l.id)).length;
}

console.log(`\nAcross ${maps!.length} maps:`);
console.log(`  ${tally.fixed} wrong agents corrected (listed above)`);
console.log(`  ${tally.filled} blank agents filled in`);
console.log(`  ${tally.same} already right`);
console.log(`  ${tally.unsure} left alone (matcher not sure)`);
if (tally.unmatched) console.log(`  ${tally.unmatched} stat lines couldn't be paired with a screenshot row`);
if (tally.skippedMaps) console.log(`  ${tally.skippedMaps} maps skipped`);

if (!commit) {
  console.log("\nDry run: nothing written. Re-run with --commit to save.");
  process.exit(0);
}
for (const u of updates) {
  const { error } = await db.from("player_map_stats").update({ agent: u.agent }).eq("id", u.id);
  if (error) throw error;
}
console.log(`\nSaved ${updates.length} agent changes.`);
