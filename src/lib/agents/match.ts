// Identify agents on a scoreboard screenshot by template matching.
//
// 1. findRows()  locates the rows by their colored stripe        (rows.ts)
// 2. each portrait is cropped, shrunk and compared to every agent (prep.ts)
// 3. NCC picks the best agent; confidentPick() decides if it's sure (score.ts)
//
// The 30-odd official agent icons are downloaded from valorant-api.com the
// first time they're needed and kept in memory, so new agents show up
// automatically. Built and measured step by step in scripts/agent-match/.

import sharp from "sharp";
import type { ParsedScoreboard } from "../scoreboard";
import { prepCrop, prepTemplate, type Prepared } from "./prep";
import { findRows } from "./rows";
import { confidentPick, rank } from "./score";

let templates: Promise<Map<string, Prepared>> | null = null;

/** Official agent icons, prepared once per server start. Key = agent name ("KAY/O"). */
export function agentTemplates() {
  templates ??= (async () => {
    const res = await fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true");
    if (!res.ok) throw new Error(`valorant-api.com returned ${res.status}`);
    const agents = (await res.json()).data as { displayName: string; displayIcon: string }[];
    const map = new Map<string, Prepared>();
    await Promise.all(
      agents.map(async (a) => {
        const png = Buffer.from(await (await fetch(a.displayIcon)).arrayBuffer());
        map.set(a.displayName, await prepTemplate(png));
      }),
    );
    return map;
  })().catch((e) => {
    templates = null; // let the next call retry
    throw e;
  });
  return templates;
}

export type AgentRow = {
  side: "ally" | "enemy";
  agent: string | null; // null = not confident enough
  best: string;
  score: number;
  margin: number;
};

/**
 * Find every row on a Match Details scoreboard and identify its agent.
 * Returns null if the layout isn't recognized (e.g. an in-game Tab scoreboard).
 */
export async function matchAgents(image: Buffer): Promise<AgentRow[] | null> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const layout = findRows(data, info.width, info.height, info.channels);
  if (!layout || layout.rows.length < 6) return null;
  const tmpl = await agentTemplates();

  const out: AgentRow[] = [];
  for (const r of layout.rows) {
    const size = Math.min(r.height, info.width - layout.stripeRight - 1);
    const crop = await sharp(image)
      .extract({ left: layout.stripeRight + 1, top: r.top, width: size, height: r.height })
      .png()
      .toBuffer();
    const ranked = rank(await prepCrop(crop), tmpl);
    out.push({
      side: r.side === "enemy" ? "enemy" : "ally",
      agent: confidentPick(ranked),
      best: ranked[0].agent,
      score: ranked[0].score,
      margin: ranked[0].score - ranked[1].score,
    });
  }
  return out;
}

/**
 * Put the matcher's agents onto Claude's reading of the same screenshot.
 * Both list players top to bottom, so we pair them up within each team.
 * If a team's row counts don't line up, that team keeps Claude's agents.
 */
export function applyAgents(parsed: ParsedScoreboard, rows: AgentRow[]): ParsedScoreboard {
  const players = parsed.players.map((p) => ({ ...p }));
  for (const side of ["ally", "enemy"] as const) {
    const mine = rows.filter((r) => r.side === side);
    const theirs = players.filter((p) => p.side === side);
    if (mine.length !== theirs.length) continue;
    theirs.forEach((p, i) => (p.agent = mine[i].agent));
  }
  return { ...parsed, players };
}

/** Run the matcher and merge it in; on any failure, keep Claude's agents. */
export async function withMatchedAgents(image: Buffer, parsed: ParsedScoreboard) {
  try {
    const rows = await matchAgents(image);
    return rows ? applyAgents(parsed, rows) : parsed;
  } catch (e) {
    console.error("agent matcher failed; keeping Claude's agents", e);
    return parsed;
  }
}
