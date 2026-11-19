import "server-only";
import { supabaseAdmin, supabaseServer } from "./supabase";
import type { Player } from "./types";

export type Viewer = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  player: Player | null;
  /** Admins, captains and players can all upload results. */
  canUpload: boolean;
};

/** Who is signed in, or null. Creates their profile row on first visit. */
export async function getViewer(): Promise<Viewer | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = supabaseAdmin();
  let { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    await admin.from("profiles").insert({ user_id: user.id, email: user.email });
    profile = { is_admin: false };
  }
  const { data: player } = await admin
    .from("players")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Player>();

  const isAdmin = !!profile.is_admin;
  return {
    userId: user.id,
    email: user.email ?? null,
    isAdmin,
    player: player ?? null,
    canUpload: isAdmin || !!player,
  };
}

export async function requireUploader() {
  const v = await getViewer();
  if (!v) throw new Error("Sign in first.");
  if (!v.canUpload) throw new Error("Link your account to a player on the Account page first.");
  return v;
}

export async function requireAdmin() {
  const v = await getViewer();
  if (!v?.isAdmin) throw new Error("Admins only.");
  return v;
}
