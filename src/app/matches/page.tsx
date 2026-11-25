import MatchList from "@/components/MatchList";
import { teamMap } from "@/lib/data";
import { NO_SEASON, seasonContext } from "@/lib/season";
import { supabasePublic } from "@/lib/supabase";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const sid = (await seasonContext()).selected?.id ?? NO_SEASON;
  const [teams, { data }] = await Promise.all([
    teamMap(),
    supabasePublic().from("matches").select("*").eq("season_id", sid).order("scheduled_at", { ascending: false, nullsFirst: false }),
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
