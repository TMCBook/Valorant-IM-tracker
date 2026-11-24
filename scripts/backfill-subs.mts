// Add the subs that were left off maps imported before subs were kept.
//
//   npm run backfill-subs             dry run: shows who would be added
//   npm run backfill-subs -- --commit write them
//
// For each saved map: re-read its screenshot (Claude's cached reading for
// names and numbers, the template matcher for agents), find the rows that
// aren't already saved, and add them as subs on the team of their side.
// Safe to run again: rows already saved are recognized by name and skipped.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withMatchedAgents } from "../src/lib/agents/match";
import { matchNames } from "../src/lib/names";
import type { ParsedScoreboard } from "../src/lib/scoreboard";

const commit = process.argv.includes("--commit");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { error: colErr } = await db.from("player_map_stats").select("sub_name").limit(1);
if (colErr) throw new Error("Run supabase/migrations/003_subs.sql in the SQL Editor first.");

const { data: maps } = await db.from("match_maps").select("id, map_name, screenshot_path").not("screenshot_path", "is", null);
const inserts: Record<string, unknown>[] = [];
let skipped = 0;

for (const m of maps!) {
  const { data: file } = await db.storage.from("scoreboards").download(m.screenshot_path!);
  if (!file) { skipped++; continue; }
  const bytes = Buffer.from(await file.arrayBuffer());
  const cache = join(".import-cache", `${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}.json`);
  if (!existsSync(cache)) { skipped++; continue; }
  const parsed = await withMatchedAgents(bytes, JSON.parse(readFileSync(cache, "utf8")) as ParsedScoreboard);

  const { data: lines } = await db
    .from("player_map_stats")
    .select("id, team_id, sub_name, players(riot_name)")
    .eq("match_map_id", m.id);
  const saved = lines!.map((l) => ({
    id: l.id as string,
    team_id: l.team_id as string,
    riot_name: (l.players as unknown as { riot_name: string } | null)?.riot_name ?? (l.sub_name as string),
  }));
  const pairs = matchNames(parsed.players.map((p) => p.name), saved);

  // Which team is each side? Use the saved lines we could pair on that side.
  const teamOf: Record<string, string | undefined> = {};
  for (const side of ["ally", "enemy"] as const) {
    const ids = parsed.players.flatMap((p, i) => (p.side === side && pairs[i] ? [pairs[i]!.team_id] : []));
    teamOf[side] = ids.sort((a, b) => ids.filter((x) => x === b).length - ids.filter((x) => x === a).length)[0];
  }

  parsed.players.forEach((p, i) => {
    if (pairs[i]) return; // already saved
    const team = teamOf[p.side];
    if (!team) return;
    console.log(`  ${(m.map_name ?? "?").padEnd(8)} + ${p.name.padEnd(18)} ${p.agent ?? "?"}  ${p.kills}/${p.deaths}/${p.assists}`);
    inserts.push({
      match_map_id: m.id, player_id: null, sub_name: p.name, team_id: team, agent: p.agent, acs: p.acs,
      kills: p.kills, deaths: p.deaths, assists: p.assists, econ: p.econ,
      first_bloods: p.first_bloods, plants: p.plants, defuses: p.defuses,
    });
  });
}

console.log(`\n${inserts.length} sub lines to add across ${maps!.length} maps${skipped ? ` (${skipped} maps skipped)` : ""}.`);
if (!commit) {
  console.log("Dry run: nothing written. Re-run with --commit to save.");
  process.exit(0);
}
if (inserts.length) {
  const { error } = await db.from("player_map_stats").insert(inserts);
  if (error) throw error;
}
console.log(`Saved ${inserts.length} sub lines.`);
