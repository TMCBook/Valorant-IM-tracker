import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { supabasePublic } from "@/lib/supabase";
import type { Match, Player, Team } from "@/lib/types";
import UploadForm from "./UploadForm";

export const dynamic = "force-dynamic";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <p>
        Sign in to upload match results.
        <Link href="/login" className="btn btn-primary ml-3">Sign in</Link>
      </p>
    );
  }
  if (!viewer.canUpload) {
    return (
      <p>
        Claim your player profile to upload results.
        <Link href="/account" className="btn btn-primary ml-3">Claim your profile</Link>
      </p>
    );
  }

  const db = supabasePublic();
  const [{ data: matches }, { data: teams }, { data: players }] = await Promise.all([
    db.from("matches").select("*").order("scheduled_at", { ascending: false, nullsFirst: false }).limit(100),
    db.from("teams").select("*").order("name"),
    db.from("players").select("*").order("riot_name"),
  ]);
  const { match } = await searchParams;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Upload a map result</h1>
      <p className="text-sm text-zinc-400">
        Upload one screenshot per map. Claude reads the stats, then you check them before saving.
      </p>
      <UploadForm
        matches={(matches ?? []) as Match[]}
        teams={(teams ?? []) as Team[]}
        players={(players ?? []) as Player[]}
        initialMatchId={match}
      />
    </div>
  );
}
