import Link from "next/link";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { cancelClaimAction, claimProfileAction, signOut, updateMyRiotIdAction } from "@/app/actions";
import { getViewer } from "@/lib/auth";
import { discordMatch } from "@/lib/claims";
import { currentSeason } from "@/lib/season";
import { supabaseAdmin } from "@/lib/supabase";
import { riotId, type Team } from "@/lib/types";

export const dynamic = "force-dynamic";

const field = "rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
type Row = { id: string; riot_name: string; riot_tag: string | null; team_id: string | null; user_id: string | null; discord: string | null };

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const season = await currentSeason();
  const db = supabaseAdmin(); // server only: reads sign-up Discords and claims, never sent to the browser as a list
  const [{ data: players }, { data: teams }, { data: pending }] = await Promise.all([
    db.from("players").select("id, riot_name, riot_tag, team_id, user_id, discord").order("riot_name"),
    db.from("teams").select("*").eq("season_id", season.id).order("name"),
    db.from("player_claims").select("player_id").eq("user_id", viewer.userId).eq("status", "pending").maybeSingle(),
  ]);
  const all = (players ?? []) as Row[];
  const teamName = new Map(((teams ?? []) as Team[]).map((t) => [t.id, t.name]));
  const unclaimed = all.filter((p) => !p.user_id);
  const suggested = unclaimed
    .map((p) => ({ p, match: discordMatch(p.discord, viewer.discord) }))
    .filter((x) => x.match);
  const pendingPlayer = pending ? all.find((p) => p.id === pending.player_id) : null;

  async function cancel() {
    "use server";
    await cancelClaimAction();
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>
      <p className="text-zinc-400">
        Signed in {viewer.discord ? <>with Discord as <b className="text-zinc-200">{viewer.discord.username}</b></> : <>as {viewer.email}</>}
        {viewer.isAdmin && <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">Admin</span>}
      </p>

      {viewer.player ? (
        // ---- Already claimed ----
        <section className="card space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Your profile</h2>
            <p className="mt-1">
              <span className="text-lg font-semibold">{riotId(viewer.player)}</span>
              {viewer.player.team_id && <span className="text-zinc-400"> · {teamName.get(viewer.player.team_id)}</span>}
            </p>
            <p className="text-sm text-zinc-500">You can upload match results.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/players/${viewer.player.id}`} className="btn btn-secondary">View my profile</Link>
              <Link href="/upload" className="btn btn-primary">Upload a result</Link>
            </div>
          </div>
          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <h3 className="text-sm font-semibold">Changed your Riot name?</h3>
            <p className="text-sm text-zinc-400">
              Enter your current Riot ID so your rank loads and new screenshots match you. Your stats stay on your profile.
            </p>
            <ActionForm action={updateMyRiotIdAction} submit="Update Riot ID" className="flex flex-wrap items-center gap-3">
              <input name="riotId" required placeholder="Name#TAG" defaultValue={riotId(viewer.player)} className={`${field} w-56`} />
            </ActionForm>
          </div>
        </section>
      ) : pendingPlayer ? (
        // ---- Waiting for an admin ----
        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Claim requested</h2>
          <p className="text-sm text-zinc-400">
            You asked to claim <b className="text-zinc-200">{riotId(pendingPlayer)}</b>
            {pendingPlayer.team_id && <> ({teamName.get(pendingPlayer.team_id)})</>}. An admin will approve it soon.
          </p>
          <form action={cancel}>
            <button className="btn btn-secondary">Cancel request</button>
          </form>
        </section>
      ) : (
        // ---- Not claimed yet ----
        <section className="card space-y-4 p-4">
          <div>
            <h2 className="font-semibold">Claim your player profile</h2>
            <p className="text-sm text-zinc-400">
              Claiming links your account to your stats, lets you upload results, and lets you update your Riot ID if you rename.
            </p>
          </div>

          {suggested.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-300">Is this you? It matches your Discord from the sign-up sheet:</p>
              {suggested.map(({ p, match }) => (
                <ActionForm key={p.id} action={claimProfileAction} submit={match === "exact" ? "Claim" : "Request"} className="flex flex-wrap items-center gap-3 rounded border border-zinc-800 p-3">
                  <input type="hidden" name="playerId" value={p.id} />
                  <div className="mr-auto">
                    <div className="font-medium">{riotId(p)}</div>
                    <div className="text-xs text-zinc-500">
                      {p.team_id ? teamName.get(p.team_id) : "No team"} ·{" "}
                      {match === "exact" ? "claims instantly" : "matches your display name, so an admin confirms"}
                    </div>
                  </div>
                </ActionForm>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <p className="text-sm text-zinc-300">{suggested.length ? "Not you? Find your profile:" : "Find your profile:"}</p>
            <ActionForm action={claimProfileAction} submit="Request" className="flex flex-wrap items-center gap-3">
              <select name="playerId" required defaultValue="" className={`${field} min-w-56`}>
                <option value="" disabled>Choose your Riot ID…</option>
                {((teams ?? []) as Team[]).map((t) => {
                  const roster = unclaimed.filter((p) => p.team_id === t.id);
                  return roster.length ? (
                    <optgroup key={t.id} label={t.name}>
                      {roster.map((p) => <option key={p.id} value={p.id}>{riotId(p)}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </ActionForm>
            <p className="text-xs text-zinc-500">
              {viewer.discord
                ? "If your Discord matches the sign-up sheet it's claimed instantly; otherwise an admin approves it."
                : "Sign in with Discord to claim instantly. Email accounts need an admin to approve."}
            </p>
          </div>
        </section>
      )}

      <form action={signOut}>
        <button className="btn btn-secondary">Sign out</button>
      </form>
    </div>
  );
}
