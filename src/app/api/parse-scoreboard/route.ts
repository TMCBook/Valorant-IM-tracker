import { NextResponse } from "next/server";
import { requireUploader } from "@/lib/auth";
import { withMatchedAgents } from "@/lib/agents/match";
import { parseScoreboard } from "@/lib/scoreboard";
import { screenshotUrl, supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof TYPES)[number];

export async function POST(req: Request) {
  try {
    await requireUploader();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const matchId = String(form.get("matchId") ?? "");
  if (!(file instanceof File) || !matchId) {
    return NextResponse.json({ error: "Pick a match and an image." }, { status: 400 });
  }
  if (!TYPES.includes(file.type as ImageType)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "Image is too large (max 4 MB)." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1];
  const path = `${matchId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin()
    .storage.from("scoreboards")
    .upload(path, bytes, { contentType: file.type });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  try {
    // Claude reads names, numbers and score; the template matcher identifies
    // agents from their portraits (more accurate, and knows new agents).
    const parsed = await withMatchedAgents(
      bytes,
      await parseScoreboard(bytes.toString("base64"), file.type as ImageType),
    );
    return NextResponse.json({ screenshotPath: path, screenshotUrl: screenshotUrl(path), parsed });
  } catch (e) {
    console.error("parseScoreboard failed", e);
    return NextResponse.json(
      {
        error: (e as Error).message || "Couldn't read the scoreboard.",
        screenshotPath: path,
        screenshotUrl: screenshotUrl(path),
      },
      { status: 422 },
    );
  }
}
