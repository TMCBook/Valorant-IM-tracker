// STEP 5 — How often is the matcher right, and when should we trust it?
//
//   npm run agents:5 -- "<folder of screenshots>"
//
// We have a second opinion for most rows: the agent Claude named during the
// bulk import (cached in .import-cache/). For each screenshot row we line up:
//   • the matcher's pick (step 4)
//   • Claude's pick (may be blank)
// and sort every row into: AGREE, DISAGREE, or FILLED (Claude left it blank).
//
// Agreement doesn't prove both are right, but two very different methods
// agreeing is strong evidence. Every DISAGREE gets saved as a picture so a
// person can decide who's right; that's how we measure real accuracy.
//
// Output: scripts/agent-match/data/step5-disagree.png

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import type { ParsedScoreboard } from "../../src/lib/scoreboard";

const folder = process.argv[2];
if (!folder) throw new Error('Usage: npm run agents:5 -- "<folder>"');
const DATA = "scripts/agent-match/data";
sharp.cache(false);

type Step4 = { shot: string; file: string; side: string; top3: { agent: string; score: number }[] };
const step4 = JSON.parse(readFileSync(join(DATA, "step4-results.json"), "utf8")) as Step4[];
const norm = (a: string | null | undefined) => (a ?? "").toLowerCase().replace(/[^a-z]/g, ""); // "KAY/O" = "KAYO"

type Row = { shot: string; file: string; mine: string; margin: number; best: number; claude: string | null };
const rows: Row[] = [];
let misaligned = 0;

for (const f of readdirSync(folder).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
  // The bulk importer cached Claude's reading under a hash of the file's bytes.
  const hash = createHash("sha1").update(readFileSync(join(folder, f))).digest("hex").slice(0, 16);
  const cache = join(".import-cache", `${hash}.json`);
  if (!existsSync(cache)) continue;
  const parsed = JSON.parse(readFileSync(cache, "utf8")) as ParsedScoreboard;
  const shot = basename(f, extname(f));
  const crops = step4.filter((r) => r.shot === shot).sort((a, b) => a.file.localeCompare(b.file));

  // Claude listed players top to bottom, like our rows. Pair them up within each
  // team ("you" counts as ally) so one skipped row can't shift every pair after it.
  for (const side of ["ally", "enemy"] as const) {
    const mineSide = crops.filter((c) => (side === "ally" ? c.side !== "enemy" : c.side === "enemy"));
    const claudeSide = parsed.players.filter((p) => p.side === side);
    if (mineSide.length !== claudeSide.length) {
      misaligned++;
      continue;
    }
    mineSide.forEach((c, i) =>
      rows.push({
        shot, file: c.file,
        mine: c.top3[0].agent,
        best: c.top3[0].score,
        margin: c.top3[0].score - c.top3[1].score,
        claude: claudeSide[i].agent,
      }),
    );
  }
}

const agree = rows.filter((r) => r.claude && norm(r.claude) === norm(r.mine));
const disagree = rows.filter((r) => r.claude && norm(r.claude) !== norm(r.mine));
const filled = rows.filter((r) => !r.claude);
console.log(`Lined up ${rows.length} rows with Claude's answers${misaligned ? ` (${misaligned} team lists skipped: different lengths)` : ""}.\n`);
console.log(`  AGREE      ${String(agree.length).padStart(3)}   both named the same agent`);
console.log(`  DISAGREE   ${String(disagree.length).padStart(3)}   different agents: check these by eye`);
console.log(`  FILLED     ${String(filled.length).padStart(3)}   Claude left it blank; the matcher has an answer\n`);

const counts = (xs: Row[]) => {
  const m = new Map<string, number>();
  xs.forEach((r) => m.set(r.mine, (m.get(r.mine) ?? 0) + 1));
  return [...m].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(", ");
};
console.log("Blanks the matcher fills:", counts(filled));
console.log("\nDisagreements (matcher vs Claude):");
disagree.forEach((r) =>
  console.log(`  ${(r.shot + "/" + r.file).padEnd(36)} matcher ${r.mine.padEnd(9)} (best ${r.best.toFixed(2)}, margin ${r.margin.toFixed(2)})   Claude ${r.claude}`),
);

// Margins in each group, to see where a cutoff could go.
const lo = (xs: Row[]) => (xs.length ? Math.min(...xs.map((r) => r.margin)).toFixed(2) : "–");
console.log(`\nSmallest margin: AGREE ${lo(agree)}, DISAGREE ${lo(disagree)}, FILLED ${lo(filled)}`);

// Picture: each disagreement = crop | matcher's icon | Claude's icon.
if (disagree.length) {
  const T = 72, LINE = T + 22;
  const icon = async (a: string) => {
    const p = join(DATA, "icons", `${a.replace("/", "")}.png`);
    return existsSync(p) ? sharp(readFileSync(p)).resize(T, T).flatten({ background: "#333" }).png().toBuffer() : null;
  };
  const text = (s: string, w: number, color = "#ddd") =>
    Buffer.from(`<svg width="${w}" height="16"><text x="${w / 2}" y="12" font-family="Arial" font-size="11" fill="${color}" text-anchor="middle">${s}</text></svg>`);
  const over: sharp.OverlayOptions[] = [
    { input: text("portrait", T), left: 10, top: 0 },
    { input: text("matcher", T), left: 100, top: 0 },
    { input: text("Claude", T), left: 190, top: 0 },
  ];
  for (const [i, r] of disagree.entries()) {
    const y = 18 + i * LINE;
    over.push({ input: await sharp(readFileSync(join(DATA, "crops", r.shot, r.file))).resize(T, T).png().toBuffer(), left: 10, top: y });
    const m = await icon(r.mine), c = await icon(r.claude!);
    if (m) over.push({ input: m, left: 100, top: y });
    if (c) over.push({ input: c, left: 190, top: y });
    over.push({ input: text(`${r.shot}/${r.file.slice(0, 5)}`, T + 10, "#999"), left: 5, top: y + T + 2 });
    over.push({ input: text(r.mine, T, "#7d9"), left: 100, top: y + T + 2 });
    over.push({ input: text(r.claude!, T, "#f98"), left: 190, top: y + T + 2 });
  }
  await sharp({ create: { width: 280, height: 18 + disagree.length * LINE, channels: 3, background: "#1e2430" } })
    .composite(over).png().toFile(join(DATA, "step5-disagree.png"));
  console.log(`\nSaved ${DATA}/step5-disagree.png`);
}
