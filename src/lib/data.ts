import "server-only";
import { supabasePublic } from "./supabase";
import type { Team } from "./types";

export async function teamMap() {
  const { data } = await supabasePublic().from("teams").select("*");
  return new Map(((data ?? []) as Team[]).map((t) => [t.id, t]));
}

export const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD";

export const kd = (k: number, d: number) => (d === 0 ? k.toFixed(2) : (k / d).toFixed(2));
export const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");
