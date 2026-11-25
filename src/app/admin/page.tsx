import ActionForm from "@/components/ActionForm";
import {
  addPlayerAction, addTeamAction, createMatchAction, fixRiotIdAction, syncChallongeAction,
} from "@/app/actions";
import { getViewer } from "@/lib/auth";
import type { PlayerRank } from "@/lib/ranks";
import { currentSeason } from "@/lib/season";
import { supabaseAdmin, supabasePublic } from "@/lib/supabase";
import { riotId, type Player, type Team } from "@/lib/types";
import { ClaimDecision, UnlinkButton } from "./ClaimButtons";
import RosterImport from "./RosterImport";

export const dynamic = "force-dynamic";

const field = "rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";

export default async function AdminPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return <p>Admins only.</p>;
  const season = await currentSeason(); // admin tools work on the current season
  const db = supabasePublic();
  const [{ data }, { data: playerRows }, { data: rankRows }] = await Promise.all([
    db.from("teams").select("*").eq("season_id", season.id).order("name"),
    db.from("players").select("*").order("riot_name"),
    db.from("player_ranks").select("player_id, status, error"),
  ]);
  const teams = (data ?? []) as Team[];
  const teamOptions = teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>);
  const players = (playerRows ?? []) as Player[];
  const rankOf = new Map(((rankRows ?? []) as Pick<PlayerRank, "player_id" | "status" | "error">[]).map((r) => [r.player_id, r]));
  // Players whose rank can't load: no #tag, or Riot says the ID doesn't exist.
  const broken = players.filter((p) => !p.riot_tag || rankOf.get(p.id)?.status === "not_found");

  // Profile claims (private table, read with the service role).
  const { data: claimRows } = await supabaseAdmin()
    .from("player_claims")
    .select("id, player_id, discord, created_at")
    .eq("status", "pending")
    .order("created_at");
  const { data: signup } = await supabaseAdmin().from("players").select("id, discord");
  const signupDiscord = new Map((signup ?? []).map((p) => [p.id as string, p.discord as string | null]));
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const claimed = players.filter((p) => p.user_id);

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Admin <span className="text-base font-normal text-zinc-500">· current season {season.name}</span></h1>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Season sign-up sheet</h2>
        <p className="text-sm text-zinc-400">
          Upload the season&apos;s Player Directory (.xlsx) and preview the changes before anything is saved. Players are
          matched by Discord, then Riot ID, so returning players keep their history even if they renamed.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">
          <li><b className="text-zinc-200">Update {season.name} rosters</b>: roster changes mid-season. Players missing from the sheet leave their team.</li>
          <li><b className="text-zinc-200">Start a new season</b>: archives {season.name} (still viewable from the season menu) and builds the new season&apos;s teams from the sheet.</li>
        </ul>
        <RosterImport currentSeason={season.name} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">
          Profile claims{claimRows?.length ? <span className="ml-2 rounded bg-rose-600 px-2 py-0.5 text-xs">{claimRows.length}</span> : null}
        </h2>
        <p className="text-sm text-zinc-400">
          Players whose Discord matches the sign-up sheet claim instantly. These need you to check: compare the two Discords.
        </p>
        {claimRows?.length ? (
          <ul className="divide-y divide-zinc-800">
            {claimRows.map((c) => {
              const p = byId.get(c.player_id);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <div className="mr-auto">
                    <div className="font-medium">{p ? riotId(p) : "?"} <span className="text-zinc-500">{p?.team_id ? teamName.get(p.team_id) : ""}</span></div>
                    <div className="text-xs text-zinc-400">
                      Requested by <b className="text-zinc-200">{c.discord ?? "unknown"}</b> · sign-up Discord{" "}
                      <b className="text-zinc-200">{signupDiscord.get(c.player_id) ?? "none"}</b>
                    </div>
                  </div>
                  <ClaimDecision claimId={c.id} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No requests waiting.</p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-400">{claimed.length} of {players.length} profiles claimed</summary>
          <ul className="mt-2 space-y-1">
            {claimed.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span>{riotId(p)}</span>
                <span className="text-zinc-500">{p.team_id ? teamName.get(p.team_id) : ""}</span>
                <UnlinkButton playerId={p.id} name={riotId(p)} />
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Fix a player&apos;s Riot ID</h2>
        <p className="text-sm text-zinc-400">
          Use this when someone changes their in-game name or their #tag is wrong. Their stats stay attached, and their rank reloads.
        </p>
        {broken.length > 0 && (
          <p className="text-sm text-amber-300">
            Rank can&apos;t load for: {broken.map((p) => riotId(p)).join(", ")}
          </p>
        )}
        <ActionForm action={fixRiotIdAction} submit="Save Riot ID" className="flex flex-wrap items-center gap-3">
          <select name="playerId" required className={field} defaultValue="">
            <option value="" disabled>Player…</option>
            {broken.length > 0 && (
              <optgroup label="Needs fixing">
                {broken.map((p) => <option key={p.id} value={p.id}>{riotId(p)}</option>)}
              </optgroup>
            )}
            <optgroup label="Everyone">
              {players.map((p) => <option key={p.id} value={p.id}>{riotId(p)}</option>)}
            </optgroup>
          </select>
          <input name="riotId" required placeholder="NewName#TAG" className={field} />
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Sync from Challonge</h2>
        <p className="text-sm text-zinc-400">
          Imports teams and bracket matches. Safe to run again any time: existing teams and matches are updated, not duplicated.
        </p>
        <ActionForm action={syncChallongeAction} submit="Sync">
          <input name="tournament" required placeholder="https://challonge.com/your_tourney or tournament ID" className={`${field} w-full`} />
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Add or update a player</h2>
        <p className="text-sm text-zinc-400">Adding an existing Riot ID again moves them to the chosen team.</p>
        <ActionForm action={addPlayerAction} submit="Save player" className="flex flex-wrap items-center gap-3">
          <input name="riotId" required placeholder="Name#TAG" className={field} />
          <select name="teamId" className={field} defaultValue="">
            <option value="">No team</option>
            {teamOptions}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="captain" /> Captain</label>
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Add a team</h2>
        <ActionForm action={addTeamAction} submit="Add team" className="flex flex-wrap items-center gap-3">
          <input name="name" required placeholder="Team name" className={field} />
          <input name="tag" placeholder="Tag (optional)" className={`${field} w-32`} />
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Create a match by hand</h2>
        <p className="text-sm text-zinc-400">For matches that aren&apos;t on Challonge, like scrims or makeup games.</p>
        <ActionForm action={createMatchAction} submit="Create match" className="grid gap-3 sm:grid-cols-2">
          <select name="teamA" required className={field} defaultValue=""><option value="" disabled>Team A</option>{teamOptions}</select>
          <select name="teamB" required className={field} defaultValue=""><option value="" disabled>Team B</option>{teamOptions}</select>
          <input name="round" placeholder="Round (e.g. Week 3)" className={field} />
          <input name="scheduledAt" type="datetime-local" className={field} />
        </ActionForm>
      </section>
    </div>
  );
}
