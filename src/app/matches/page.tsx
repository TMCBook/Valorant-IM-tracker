import MatchList from "@/components/MatchList";
import { teamMap } from "@/lib/data";
import { supabasePublic } from "@/lib/supabase";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const [teams, { data }] = await Promise.all([
    teamMap(),
    supabasePublic().from("matches").select("*").order("scheduled_at", { ascending: false, nullsFirst: false }),
  ]);
  const all = (data ?? []) as Match[];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Matches</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Scheduled</h2>
        <div className="card"><MatchList matches={all.filter((m) => m.status === "scheduled")} teams={teams} empty="Nothing scheduled." /></div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Completed</h2>
        <div className="card"><MatchList matches={all.filter((m) => m.status === "completed")} teams={teams} /></div>
      </section>
    </div>
  );
}
