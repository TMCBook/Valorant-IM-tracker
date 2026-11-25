import "server-only";
// Turn a parsed sign-up sheet into rosters.
//
// mode "new"     archive the current season and start a new one from the sheet
// mode "update"  replace the current season's rosters with the sheet (mid-season changes)
//
// Players carry over between seasons. Each sheet row is matched to an existing
// player by, in order: Discord username, full Riot ID, or Riot name alone when
// only one player has it. A match keeps that player's history; their Riot ID,
// Discord and team are updated from the sheet.

import type { SheetPlayer, SheetTeam } from "./roster-sheet";
import { supabaseAdmin } from "./supabase";

type Existing = { id: string; riot_name: string; riot_tag: string | null; discord: string | null; team_id: string | null };
export type Mode = "new" | "update";

export type PlanRow = {
  team: string;
  realName: string;
  riotId: string;
  playerId: string | null; // null = new player
  matchedBy: "discord" | "riot id" | "name" | null;
  changes: string[];
};
export type Plan = {
  seasonName: string;
  mode: Mode;
  teams: { name: string; group: string | null; players: number; isNew: boolean }[];
  rows: PlanRow[];
  leaving: string[]; // on the current roster, not on the sheet
  warnings: string[];
  counts: { teams: number; players: number; newPlayers: number; idChanges: number; moved: number; leaving: number };
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim().replace(/^@/, "");
const rid = (n: string, t: string | null) => (t ? `${n}#${t}` : n);

function matcher(existing: Existing[]) {
  const used = new Set<string>();
  return (sp: SheetPlayer): { p: Existing; by: PlanRow["matchedBy"] } | null => {
    const free = existing.filter((e) => !used.has(e.id));
    const take = (p: Existing | undefined, by: PlanRow["matchedBy"]) => (p ? (used.add(p.id), { p, by }) : null);
    if (sp.discord) {
      const hit = free.find((e) => e.discord && norm(e.discord) === norm(sp.discord));
      if (hit) return take(hit, "discord");
    }
    const full = free.find((e) => norm(e.riot_name) === norm(sp.riotName) && norm(e.riot_tag) === norm(sp.riotTag));
    if (full) return take(full, "riot id");
    const byName = free.filter((e) => norm(e.riot_name) === norm(sp.riotName));
    if (byName.length === 1) return take(byName[0], "name");
    return null;
  };
}

/** Work out what an import would change, without writing anything. */
export async function planImport(sheet: SheetTeam[], mode: Mode, seasonName: string, updateIds = mode === "new"): Promise<Plan> {
  const db = supabaseAdmin();
  const [{ data: players }, { data: current }] = await Promise.all([
    db.from("players").select("id, riot_name, riot_tag, discord, team_id"),
    db.from("seasons").select("id, name").eq("is_current", true).maybeSingle(),
  ]);
  const existing = (players ?? []) as Existing[];
  const { data: curTeams } = current
    ? await db.from("teams").select("id, name").eq("season_id", current.id)
    : { data: [] as { id: string; name: string }[] };
  const teamNameById = new Map((curTeams ?? []).map((t) => [t.id, t.name]));
  const curTeamNames = new Set((curTeams ?? []).map((t) => norm(t.name)));

  const warnings: string[] = [];
  if (!sheet.length) warnings.push("No team blocks found. The sheet needs a team name above a 'Player | Riot ID | Discord' header.");
  if (mode === "new") {
    if (!seasonName.trim()) warnings.push("Enter a name for the new season.");
    const { data: dup } = await db.from("seasons").select("id").eq("name", seasonName.trim().toUpperCase()).maybeSingle();
    if (dup) warnings.push(`A season named ${seasonName.toUpperCase()} already exists.`);
  }
  const seen = new Map<string, string>();
  for (const t of sheet) for (const p of t.players) {
    const key = norm(rid(p.riotName, p.riotTag));
    if (seen.has(key)) warnings.push(`${rid(p.riotName, p.riotTag)} is listed twice (${seen.get(key)} and ${t.name}).`);
    seen.set(key, t.name);
    if (!p.riotTag) warnings.push(`${p.riotName} (${t.name}) has no #tag, so their rank can't load until it's added.`);
  }

  const match = matcher(existing);
  const rows: PlanRow[] = [];
  const onSheet = new Set<string>();
  for (const t of sheet) for (const sp of t.players) {
    const m = match(sp);
    const changes: string[] = [];
    if (m) {
      onSheet.add(m.p.id);
      if (norm(rid(m.p.riot_name, m.p.riot_tag)) !== norm(rid(sp.riotName, sp.riotTag))) {
        changes.push(updateIds
          ? `Riot ID ${rid(m.p.riot_name, m.p.riot_tag)} → ${rid(sp.riotName, sp.riotTag)}`
          : `keeps Riot ID ${rid(m.p.riot_name, m.p.riot_tag)} (sheet says ${rid(sp.riotName, sp.riotTag)})`);
      }
      if (sp.discord && norm(sp.discord) !== norm(m.p.discord)) changes.push(m.p.discord ? `Discord ${m.p.discord} → ${sp.discord}` : "Discord added");
      const was = m.p.team_id ? teamNameById.get(m.p.team_id) : null;
      if (mode === "update" && was && norm(was) !== norm(t.name)) changes.push(`team ${was} → ${t.name}`);
    }
    rows.push({ team: t.name, realName: sp.realName, riotId: rid(sp.riotName, sp.riotTag), playerId: m?.p.id ?? null, matchedBy: m?.by ?? null, changes });
  }
  const leaving = existing
    .filter((e) => e.team_id && teamNameById.has(e.team_id) && !onSheet.has(e.id))
    .map((e) => `${rid(e.riot_name, e.riot_tag)} (${teamNameById.get(e.team_id!)})`);

  return {
    seasonName: mode === "new" ? seasonName.trim().toUpperCase() : current?.name ?? "",
    mode,
    teams: sheet.map((t) => ({ name: t.name, group: t.group, players: t.players.length, isNew: mode === "new" || !curTeamNames.has(norm(t.name)) })),
    rows,
    leaving,
    warnings,
    counts: {
      teams: sheet.length,
      players: rows.length,
      newPlayers: rows.filter((r) => !r.playerId).length,
      idChanges: rows.filter((r) => r.changes.some((c) => c.startsWith("Riot ID"))).length,
      moved: rows.filter((r) => r.changes.some((c) => c.startsWith("team"))).length,
      leaving: leaving.length,
    },
  };
}

/** Write the import. For "new", archives the current season first. */
export async function applyImport(sheet: SheetTeam[], mode: Mode, seasonName: string, updateIds = mode === "new") {
  const plan = await planImport(sheet, mode, seasonName, updateIds);
  const blocking = plan.warnings.filter((w) => /No team blocks|Enter a name|already exists|listed twice/.test(w));
  if (blocking.length) throw new Error(blocking.join(" "));
  const db = supabaseAdmin();

  // ---- Season ----
  let seasonId: string;
  if (mode === "new") {
    const now = new Date().toISOString();
    await db.from("seasons").update({ is_current: false, archived_at: now }).eq("is_current", true);
    const { data: s, error } = await db.from("seasons").insert({ name: plan.seasonName, is_current: true }).select("id").single();
    if (error) throw new Error(`Couldn't create season: ${error.message}`);
    seasonId = s.id;
    // Nobody is on a team in the new season until the sheet puts them there.
    await db.from("players").update({ team_id: null }).not("team_id", "is", null);
  } else {
    const { data: s } = await db.from("seasons").select("id").eq("is_current", true).single();
    if (!s) throw new Error("No current season.");
    seasonId = s.id;
  }

  // ---- Teams ----
  const { data: teamRows, error: tErr } = await db
    .from("teams")
    .upsert(sheet.map((t) => ({ season_id: seasonId, name: t.name, group_name: t.group })), { onConflict: "season_id,name" })
    .select("id, name");
  if (tErr) throw new Error(`Couldn't save teams: ${tErr.message}`);
  const teamId = new Map((teamRows ?? []).map((t) => [norm(t.name), t.id as string]));

  // ---- Players + roster ----
  const { data: players } = await db.from("players").select("id, riot_name, riot_tag, discord, team_id");
  const match = matcher((players ?? []) as Existing[]);
  const errors: string[] = [];
  const rostered = new Set<string>();
  for (const t of sheet) {
    const tid = teamId.get(norm(t.name))!;
    for (const sp of t.players) {
      const m = match(sp);
      let pid: string;
      if (m) {
        pid = m.p.id;
        // Only take the sheet's Riot ID when asked: an old sheet would undo renames made since.
        const idChanged = updateIds && norm(rid(m.p.riot_name, m.p.riot_tag)) !== norm(rid(sp.riotName, sp.riotTag));
        const { error } = await db.from("players").update({
          team_id: tid,
          ...(sp.discord ? { discord: sp.discord } : {}),
          ...(idChanged ? { riot_name: sp.riotName, riot_tag: sp.riotTag, puuid: null } : {}),
        }).eq("id", pid);
        if (error) { errors.push(`${rid(sp.riotName, sp.riotTag)}: ${error.code === "23505" ? "another player already has this Riot ID" : error.message}`); continue; }
        if (idChanged) await db.from("player_ranks").delete().eq("player_id", pid); // reload under the new ID
      } else {
        const { data: created, error } = await db.from("players")
          .insert({ riot_name: sp.riotName, riot_tag: sp.riotTag, discord: sp.discord, team_id: tid })
          .select("id").single();
        if (error) { errors.push(`${rid(sp.riotName, sp.riotTag)}: ${error.message}`); continue; }
        pid = created.id;
      }
      rostered.add(pid);
      await db.from("season_rosters").upsert({ season_id: seasonId, player_id: pid, team_id: tid }, { onConflict: "season_id,player_id" });
    }
  }

  // Mid-season update: anyone dropped from the sheet leaves the current roster.
  if (mode === "update") {
    const { data: roster } = await db.from("season_rosters").select("player_id").eq("season_id", seasonId);
    const gone = (roster ?? []).map((r) => r.player_id as string).filter((p) => !rostered.has(p));
    if (gone.length) {
      await db.from("season_rosters").delete().eq("season_id", seasonId).in("player_id", gone);
      await db.from("players").update({ team_id: null }).in("id", gone);
    }
  }
  return { plan, errors };
}
