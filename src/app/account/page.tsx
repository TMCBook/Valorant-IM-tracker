import Link from "next/link";
import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { linkPlayer, signOut } from "@/app/actions";
import { getViewer } from "@/lib/auth";
import { supabasePublic } from "@/lib/supabase";
import { riotId, type Player, type Team } from "@/lib/types";

export const dynamic = "force-dynamic";

const field = "rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const db = supabasePublic();
  const [{ data: players }, { data: teams }] = await Promise.all([
    db.from("players").select("*").order("riot_name"),
    db.from("teams").select("*"),
  ]);
  const teamName = new Map(((teams ?? []) as Team[]).map((t) => [t.id, t.name]));
  const unclaimed = ((players ?? []) as Player[]).filter((p) => !p.user_id || p.user_id === viewer.userId);

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>
      <p className="text-zinc-400">
        Signed in as {viewer.email}
        {viewer.isAdmin && <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">Admin</span>}
      </p>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Your player</h2>
        {viewer.player ? (
          <p>
            Linked to{" "}
            <Link href={`/players/${viewer.player.id}`} className="text-rose-400 underline">{riotId(viewer.player)}</Link>.
            You can upload results.
          </p>
        ) : (
          <p className="text-sm text-zinc-400">
            Pick your Riot ID so you can upload match results. If you&apos;re not listed, ask your captain or an admin to add you.
          </p>
        )}
        <ActionForm action={linkPlayer} submit={viewer.player ? "Change" : "That's me"} className="flex flex-wrap items-center gap-3">
          <select name="playerId" defaultValue={viewer.player?.id ?? ""} className={field}>
            <option value="" disabled>Choose your Riot ID…</option>
            {unclaimed.map((p) => (
              <option key={p.id} value={p.id}>
                {riotId(p)}{p.team_id ? ` (${teamName.get(p.team_id)})` : ""}
              </option>
            ))}
          </select>
        </ActionForm>
      </section>

      <form action={signOut}>
        <button className="text-sm text-zinc-400 underline hover:text-white">Sign out</button>
      </form>
    </div>
  );
}
