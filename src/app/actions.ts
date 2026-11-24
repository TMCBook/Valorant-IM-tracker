"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { getViewer, requireAdmin, requireUploader } from "@/lib/auth";
import { syncChallonge } from "@/lib/challonge";
import { refreshPlayerRank } from "@/lib/ranks";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase";

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => ({ ok: false, error: (e as Error).message ?? String(e) });
const int = z.number().int().nullable();

const SaveMapInput = z.object({
  matchId: z.string().uuid(),
  mapNumber: z.number().int().min(1).max(5),
  mapName: z.string().trim().max(40).nullable(),
  teamARounds: z.number().int().min(0),
  teamBRounds: z.number().int().min(0),
  screenshotPath: z.string().nullable(),
  seriesComplete: z.boolean(),
  rows: z
    .array(
      z.object({
        playerId: z.string().uuid().nullable(),
        newName: z.string().trim().max(32).nullable(),
        newTag: z.string().trim().max(8).nullable(),
        teamId: z.string().uuid(),
        agent: z.string().trim().max(24).nullable(),
        acs: int,
        kills: z.number().int().min(0),
        deaths: z.number().int().min(0),
        assists: z.number().int().min(0),
        econ: int,
        firstBloods: int,
        plants: int,
        defuses: int,
      }),
    )
    .min(2)
    .max(12),
});
export type SaveMapInput = z.infer<typeof SaveMapInput>;

export async function saveMatchMap(raw: SaveMapInput): Promise<ActionResult> {
  try {
    const viewer = await requireUploader();
    const input = SaveMapInput.parse(raw);
    const db = supabaseAdmin();

    const { data: match } = await db.from("matches").select("*").eq("id", input.matchId).single();
    if (!match) throw new Error("Match not found.");
    const teamIds = [match.team_a_id, match.team_b_id];

    // Resolve players, creating any new ones on the team they played for.
    const playerIds: string[] = [];
    for (const row of input.rows) {
      if (!teamIds.includes(row.teamId)) throw new Error("A row has a team not in this match.");
      if (row.playerId) {
        playerIds.push(row.playerId);
        continue;
      }
      if (!row.newName) throw new Error("Every row needs a player.");
      // Reuse an existing player with this name (e.g. a sub from another team).
      // Screenshots don't show #tags, so without a tag match on name alone
      // when exactly one player has it.
      const tag = row.newTag || null;
      let q = db.from("players").select("id").ilike("riot_name", row.newName);
      if (tag) q = q.ilike("riot_tag", tag);
      const { data: existing } = await q.limit(2);
      if (existing?.length === 1) {
        playerIds.push(existing[0].id);
        continue;
      }
      const { data: created, error } = await db
        .from("players")
        .insert({ riot_name: row.newName, riot_tag: tag, team_id: row.teamId })
        .select("id")
        .single();
      if (error) throw new Error(`Couldn't add ${row.newName}: ${error.message}`);
      playerIds.push(created.id);
    }
    if (new Set(playerIds).size !== playerIds.length) {
      throw new Error("The same player is selected on two rows.");
    }

    const { data: map, error: mapErr } = await db
      .from("match_maps")
      .insert({
        match_id: input.matchId,
        map_number: input.mapNumber,
        map_name: input.mapName || null,
        team_a_rounds: input.teamARounds,
        team_b_rounds: input.teamBRounds,
        screenshot_path: input.screenshotPath,
        uploaded_by: viewer.userId,
      })
      .select("id")
      .single();
    if (mapErr) {
      throw new Error(
        mapErr.code === "23505"
          ? `Map ${input.mapNumber} is already uploaded for this match. Delete it on the match page to re-upload.`
          : mapErr.message,
      );
    }

    const { error: statErr } = await db.from("player_map_stats").insert(
      input.rows.map((r, i) => ({
        match_map_id: map.id,
        player_id: playerIds[i],
        team_id: r.teamId,
        agent: r.agent || null,
        acs: r.acs,
        kills: r.kills,
        deaths: r.deaths,
        assists: r.assists,
        econ: r.econ,
        first_bloods: r.firstBloods,
        plants: r.plants,
        defuses: r.defuses,
      })),
    );
    if (statErr) {
      await db.from("match_maps").delete().eq("id", map.id);
      throw new Error(statErr.message);
    }

    if (input.seriesComplete) await finalizeMatch(input.matchId);
    revalidatePath("/", "layout");
    return { ok: true, id: input.matchId };
  } catch (e) {
    return fail(e);
  }
}

/** Set the winner from map wins and mark the match completed. */
async function finalizeMatch(matchId: string) {
  const db = supabaseAdmin();
  const { data: match } = await db.from("matches").select("*").eq("id", matchId).single();
  const { data: maps } = await db.from("match_maps").select("*").eq("match_id", matchId);
  if (!match || !maps) return;
  const aWins = maps.filter((m) => m.team_a_rounds > m.team_b_rounds).length;
  const bWins = maps.filter((m) => m.team_b_rounds > m.team_a_rounds).length;
  await db
    .from("matches")
    .update({
      status: "completed",
      winner_team_id: aWins === bWins ? null : aWins > bWins ? match.team_a_id : match.team_b_id,
    })
    .eq("id", matchId);
}

export async function deleteMatchMap(mapId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const db = supabaseAdmin();
    const { data: map } = await db.from("match_maps").select("*").eq("id", mapId).single();
    if (!map) throw new Error("Map not found.");
    await db.from("match_maps").delete().eq("id", mapId);
    if (map.screenshot_path) await db.storage.from("scoreboards").remove([map.screenshot_path]);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMatchResult(matchId: string, completed: boolean): Promise<ActionResult> {
  try {
    await requireUploader();
    if (completed) await finalizeMatch(matchId);
    else
      await supabaseAdmin()
        .from("matches")
        .update({ status: "scheduled", winner_team_id: null })
        .eq("id", matchId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- Account ----------

export async function linkPlayer(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new Error("Sign in first.");
    const playerId = String(form.get("playerId") ?? "");
    const db = supabaseAdmin();
    const { data: player } = await db.from("players").select("*").eq("id", playerId).single();
    if (!player) throw new Error("Pick a player.");
    if (player.user_id && player.user_id !== viewer.userId) {
      throw new Error("That player is already linked to another account. Ask an admin.");
    }
    await db.from("players").update({ user_id: null }).eq("user_id", viewer.userId);
    await db.from("players").update({ user_id: viewer.userId }).eq("id", playerId);
    revalidatePath("/account");
    return { ok: true, message: "Linked. You can upload results now." };
  } catch (e) {
    return fail(e);
  }
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

// ---------- Admin ----------

export async function syncChallongeAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const r = await syncChallonge(String(form.get("tournament") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: `Synced ${r.teams} teams and ${r.matches} matches.` };
  } catch (e) {
    return fail(e);
  }
}

export async function addPlayerAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const [name, tag] = String(form.get("riotId") ?? "").split("#").map((s) => s.trim());
    if (!name) throw new Error("Enter a Riot ID like Name#TAG.");
    const teamId = String(form.get("teamId") ?? "") || null;
    const { error } = await supabaseAdmin()
      .from("players")
      .upsert(
        { riot_name: name, riot_tag: tag || null, team_id: teamId, is_captain: form.get("captain") === "on" },
        { onConflict: "riot_name,riot_tag" },
      );
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved ${name}${tag ? `#${tag}` : ""}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function refreshRankAction(playerId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const r = await refreshPlayerRank(playerId);
    revalidatePath(`/players/${playerId}`);
    if (r.status === "error") throw new Error(r.error);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Correct a player's Riot ID (e.g. after a name change) and reload their rank. */
export async function fixRiotIdAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const playerId = String(form.get("playerId") ?? "");
    const [name, tag] = String(form.get("riotId") ?? "").split("#").map((s) => s.trim());
    if (!playerId) throw new Error("Pick a player.");
    if (!name || !tag) throw new Error("Enter the full Riot ID, like Name#TAG.");
    const db = supabaseAdmin();
    const { error } = await db
      .from("players")
      .update({ riot_name: name, riot_tag: tag, puuid: null })
      .eq("id", playerId);
    if (error) throw new Error(error.code === "23505" ? "Another player already has that Riot ID." : error.message);
    await db.from("player_ranks").delete().eq("player_id", playerId);
    const r = process.env.HENRIKDEV_API_KEY ? await refreshPlayerRank(playerId) : null;
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        !r ? `Saved ${name}#${tag}.`
        : r.status === "ok" ? `Saved ${name}#${tag}: ${r.current?.tier ?? "unrated"}.`
        : `Saved ${name}#${tag}, but the rank lookup said: ${"error" in r ? r.error : r.status}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function addTeamAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new Error("Enter a team name.");
    const { error } = await supabaseAdmin()
      .from("teams")
      .insert({ name, tag: String(form.get("tag") ?? "").trim() || null });
    if (error) throw new Error(error.code === "23505" ? "That team already exists." : error.message);
    revalidatePath("/", "layout");
    return { ok: true, message: `Added ${name}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function createMatchAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const a = String(form.get("teamA") ?? "");
    const b = String(form.get("teamB") ?? "");
    if (!a || !b || a === b) throw new Error("Pick two different teams.");
    const when = String(form.get("scheduledAt") ?? "");
    const { error } = await supabaseAdmin()
      .from("matches")
      .insert({
        team_a_id: a,
        team_b_id: b,
        round_label: String(form.get("round") ?? "").trim() || null,
        scheduled_at: when ? new Date(when).toISOString() : null,
      });
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true, message: "Match created." };
  } catch (e) {
    return fail(e);
  }
}
