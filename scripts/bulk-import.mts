// Import a folder of scoreboard screenshots in one go.
//
//   npm run bulk-import -- "<folder>"            dry run: read + plan, writes nothing
//   npm run bulk-import -- "<folder>" --commit   create matches, maps and stats
//
// Each screenshot is read once with Claude and cached in .import-cache/, so
// re-running (including --commit after a dry run) doesn't pay again.
// Teams are worked out from roster names; players not on the team's roster
// are saved as subs: on the scoreboard, no player profile. Screenshots of the same two teams on
// the same date become one series, ordered by file time.

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { withMatchedAgents } from "../src/lib/agents/match";
import { matchNames } from "../src/lib/names";
import { parseScoreboard, type ParsedScoreboard } from "../src/lib/scoreboard";

const [folder, flag] = process.argv.slice(2);
if (!folder) throw new Error('Usage: npm run bulk-import -- "<folder>" [--commit]');
const commit = flag === "--commit";

const TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp"> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
};
const CACHE = ".import-cache";
mkdirSync(CACHE, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

type Team = { id: string; name: string };
type Player = { id: string; riot_name: string; team_id: string | null };
// Only the current season's teams; new matches go into the current season.
const { data: season } = await db.from("seasons").select("id, name").eq("is_current", true).single();
if (!season) throw new Error("No current season. Run supabase/migrations/005_seasons.sql.");
const { data: teams } = await db.from("teams").select("id, name").eq("season_id", season.id);
const { data: players } = await db.from("players").select("id, riot_name, team_id");
const rosterOf = (teamId: string) => (players as Player[]).filter((p) => p.team_id === teamId);

// ---------- 1. Read every screenshot (cached) ----------
const files = readdirSync(folder)
  .filter((f) => TYPES[extname(f).toLowerCase()])
  .map((f) => ({ name: f, path: join(folder, f), mtime: statSync(join(folder, f)).mtimeMs }))
  .sort((a, b) => a.mtime - b.mtime);

type Shot = (typeof files)[number] & { bytes: Buffer; hash: string; parsed?: ParsedScoreboard; error?: string };
const shots: Shot[] = files.map((f) => {
  const bytes = readFileSync(f.path);
  return { ...f, bytes, hash: createHash("sha1").update(bytes).digest("hex").slice(0, 16) };
});

let next = 0;
async function worker() {
  while (next < shots.length) {
    const s = shots[next++];
    const cached = join(CACHE, `${s.hash}.json`);
    if (existsSync(cached)) {
      s.parsed = JSON.parse(readFileSync(cached, "utf8"));
      continue;
    }
    if (s.bytes.length > 5 * 1024 * 1024) {
      s.error = "over 5 MB";
      continue;
    }
    try {
      s.parsed = await parseScoreboard(s.bytes.toString("base64"), TYPES[extname(s.name).toLowerCase()]);
      writeFileSync(cached, JSON.stringify(s.parsed));
      process.stdout.write(".");
    } catch (e) {
      s.error = (e as Error).message;
    }
  }
}
await Promise.all([1, 2, 3, 4].map(worker));
console.log(`\nRead ${shots.length} screenshots.`);

// Agents come from the template matcher, not Claude (see scripts/agent-match/).
// The cache keeps Claude's raw reading; this replaces only the agent field.
let matched = 0;
for (const s of shots) {
  if (!s.parsed) continue;
  const before = s.parsed;
  s.parsed = await withMatchedAgents(s.bytes, s.parsed);
  if (s.parsed !== before) matched++;
}
console.log(`Identified agents from portraits on ${matched} of ${shots.length} screenshots.\n`);

// ---------- 2. Work out teams for each screenshot ----------
type Side = "ally" | "enemy";
type MapPlan = {
  shot: Shot;
  p: ParsedScoreboard;
  team: Record<Side, Team>;
  hits: Record<Side, number>;
  ids: Record<Side, (string | null)[]>; // player id per row, null = sub
};
const plans: MapPlan[] = [];
const flagged: string[] = [];

function bestTeam(names: string[], exclude?: string) {
  let best: { team: Team; hits: number } | null = null;
  for (const t of teams as Team[]) {
    if (t.id === exclude) continue;
    const hits = matchNames(names, rosterOf(t.id)).filter(Boolean).length;
    if (!best || hits > best.hits) best = { team: t, hits };
  }
  return best!;
}

for (const s of shots) {
  const p = s.parsed;
  if (!p) { flagged.push(`${s.name}: couldn't read (${s.error})`); continue; }
  if (!p.is_scoreboard || p.players.length < 6) { flagged.push(`${s.name}: not a scoreboard`); continue; }
  if (p.ally_rounds == null || p.enemy_rounds == null) { flagged.push(`${s.name}: round score not readable`); continue; }
  const names = (side: Side) => p.players.filter((x) => x.side === side).map((x) => x.name);
  const a = bestTeam(names("ally"));
  const e = bestTeam(names("enemy"), a.team.id);
  if (a.hits < 2 || e.hits < 2) {
    flagged.push(`${s.name}: can't tell the teams (best guess ${a.team.name} ${a.hits}/5 vs ${e.team.name} ${e.hits}/5)`);
    continue;
  }
  const ids = (side: Side, t: Team) => matchNames(names(side), rosterOf(t.id)).map((x) => x?.id ?? null);
  plans.push({
    shot: s, p,
    team: { ally: a.team, enemy: e.team },
    hits: { ally: a.hits, enemy: e.hits },
    ids: { ally: ids("ally", a.team), enemy: ids("enemy", e.team) },
  });
}

// ---------- 3. Group into series and drop duplicate screenshots ----------
const sig = (m: MapPlan) =>
  [m.p.map, ...[m.team.ally.id, m.team.enemy.id].sort(),
   ...m.p.players.map((x) => `${x.name}:${x.kills}/${x.deaths}/${x.assists}`).sort()].join("|");
const seen = new Map<string, string>();
const series = new Map<string, MapPlan[]>();
for (const m of plans) {
  const key = sig(m);
  if (seen.has(key)) { flagged.push(`${m.shot.name}: duplicate of ${seen.get(key)}, skipped`); continue; }
  seen.set(key, m.shot.name);
  // Same two teams within two days = same series (games past midnight, or a
  // deciding map played a couple of days later).
  const pair = [m.team.ally.id, m.team.enemy.id].sort().join("+");
  const day = (d: string | null) => (d ? Date.parse(d) / 86_400_000 : NaN);
  const k = [...series.keys()].find((key) => {
    const [kp, kd] = key.split("@");
    return kp === pair && Math.abs(day(kd) - day(m.p.date)) <= 2;
  }) ?? `${pair}@${m.p.date ?? "unknown-date"}`;
  series.set(k, [...(series.get(k) ?? []), m]);
}

// Order maps by date first, then by when the screenshot was saved.
for (const maps of series.values()) {
  maps.sort((a, b) => (a.p.date ?? "").localeCompare(b.p.date ?? "") || a.shot.mtime - b.shot.mtime);
}

// ---------- 4. Print the plan ----------
const subs = (m: MapPlan, side: Side) =>
  m.p.players.filter((x) => x.side === side).map((x, i) => (m.ids[side][i] ? null : x.name)).filter(Boolean);
for (const maps of series.values()) {
  const [A, B] = [maps[0].team.ally, maps[0].team.enemy];
  const w = { [A.id]: 0, [B.id]: 0 };
  for (const m of maps) w[m.p.ally_rounds! > m.p.enemy_rounds! ? m.team.ally.id : m.team.enemy.id]++;
  console.log(`${maps[0].p.date ?? "date?"}  ${A.name} ${w[A.id]}–${w[B.id]} ${B.name}`);
  maps.forEach((m, i) => {
    const s = [...subs(m, "ally"), ...subs(m, "enemy")];
    console.log(`   Map ${i + 1} ${m.p.map ?? "?"}: ${m.team.ally.name} ${m.p.ally_rounds}–${m.p.enemy_rounds} ${m.team.enemy.name}` +
      `  [${m.shot.name}]${s.length ? `  subs (no profile): ${s.join(", ")}` : ""}`);
  });
}
// Possible renamed players: a roster member who never shows up for their team,
// while an unknown name keeps playing for that team.
console.log("\nPossible renames (roster name never seen | unknown name playing 2+ maps for the team):");
for (const t of teams as Team[]) {
  const mine = plans.flatMap((m) => (["ally", "enemy"] as const).filter((s) => m.team[s].id === t.id).map((s) => ({ m, s })));
  if (!mine.length) continue;
  const seenIds = new Set(mine.flatMap(({ m, s }) => m.ids[s].filter(Boolean)));
  const missing = rosterOf(t.id).filter((p) => !seenIds.has(p.id)).map((p) => p.riot_name);
  const counts = new Map<string, number>();
  for (const { m, s } of mine) subs(m, s).forEach((n) => counts.set(n!, (counts.get(n!) ?? 0) + 1));
  const regulars = [...counts].filter(([, c]) => c >= 2).map(([n, c]) => `${n} (${c})`);
  if (missing.length && regulars.length) console.log(`  ${t.name}: ${missing.join(", ")} | ${regulars.join(", ")}`);
}

if (flagged.length) {
  console.log(`\nNeeds a look (${flagged.length}):`);
  flagged.forEach((f) => console.log(`  - ${f}`));
}

if (!commit) {
  console.log("\nDry run: nothing written. Re-run with --commit to import.");
  process.exit(0);
}

// ---------- 5. Write ----------
let made = 0;
for (const maps of series.values()) {
  const A = maps[0].team.ally;
  const B = maps[0].team.enemy;
  const date = maps[0].p.date;
  const when = date ? new Date(`${date}T20:00:00`).toISOString() : null;

  // Reuse a match between these teams on that date if one exists.
  let q = db.from("matches").select("id, team_a_id").or(
    `and(team_a_id.eq.${A.id},team_b_id.eq.${B.id}),and(team_a_id.eq.${B.id},team_b_id.eq.${A.id})`,
  );
  if (when) q = q.gte("scheduled_at", `${date}T00:00:00Z`).lte("scheduled_at", `${date}T23:59:59Z`);
  const { data: existing } = await q.limit(1);
  let match = existing?.[0];
  if (!match) {
    const { data, error } = await db.from("matches")
      .insert({ season_id: season.id, team_a_id: A.id, team_b_id: B.id, scheduled_at: when })
      .select("id, team_a_id").single();
    if (error) throw error;
    match = data;
  }
  const { data: have } = await db.from("match_maps").select("map_number").eq("match_id", match.id);
  let num = Math.max(0, ...(have ?? []).map((x) => x.map_number));

  for (const m of maps) {
    const allyIsA = m.team.ally.id === match.team_a_id;
    const path = `${match.id}/${m.shot.hash}${extname(m.shot.name).toLowerCase()}`;
    await db.storage.from("scoreboards").upload(path, m.shot.bytes, {
      contentType: TYPES[extname(m.shot.name).toLowerCase()], upsert: true,
    });
    const { data: map, error } = await db.from("match_maps").insert({
      match_id: match.id,
      map_number: ++num,
      map_name: m.p.map,
      team_a_rounds: allyIsA ? m.p.ally_rounds : m.p.enemy_rounds,
      team_b_rounds: allyIsA ? m.p.enemy_rounds : m.p.ally_rounds,
      screenshot_path: path,
      played_at: when ?? new Date(m.shot.mtime).toISOString(),
    }).select("id").single();
    if (error) throw error;

    const rows = (["ally", "enemy"] as const).flatMap((side) =>
      m.p.players.filter((x) => x.side === side).map((x, i) => {
        const pid = m.ids[side][i];
        // Subs (not on this team's roster) are kept by name, with no player profile.
        return {
          match_map_id: map.id, player_id: pid, sub_name: pid ? null : x.name,
          team_id: m.team[side].id, agent: x.agent, acs: x.acs,
          kills: x.kills, deaths: x.deaths, assists: x.assists, econ: x.econ,
          first_bloods: x.first_bloods, plants: x.plants, defuses: x.defuses,
        };
      }),
    );
    const { error: sErr } = await db.from("player_map_stats").insert(rows);
    if (sErr) throw sErr;
    made++;
  }

  // Winner = most maps won.
  const { data: all } = await db.from("match_maps").select("team_a_rounds, team_b_rounds").eq("match_id", match.id);
  const aw = all!.filter((x) => x.team_a_rounds > x.team_b_rounds).length;
  const bw = all!.filter((x) => x.team_b_rounds > x.team_a_rounds).length;
  const { data: full } = await db.from("matches").select("team_a_id, team_b_id").eq("id", match.id).single();
  await db.from("matches").update({
    status: "completed",
    winner_team_id: aw === bw ? null : aw > bw ? full!.team_a_id : full!.team_b_id,
  }).eq("id", match.id);
}
console.log(`\nImported ${made} maps across ${series.size} matches.`);
