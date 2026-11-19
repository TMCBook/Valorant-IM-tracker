import ActionForm from "@/components/ActionForm";
import { addPlayerAction, addTeamAction, createMatchAction, syncChallongeAction } from "@/app/actions";
import { getViewer } from "@/lib/auth";
import { supabasePublic } from "@/lib/supabase";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

const field = "rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";

export default async function AdminPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return <p>Admins only.</p>;
  const { data } = await supabasePublic().from("teams").select("*").order("name");
  const teams = (data ?? []) as Team[];
  const teamOptions = teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>);

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Admin</h1>

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
