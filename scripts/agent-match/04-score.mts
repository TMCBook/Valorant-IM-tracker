// STEP 4 — Score every cropped portrait against every agent.
//
//   npm run agents:4
//
// For each of the ~280 crops from step 2 we compute 30 scores (one per agent)
// with four variants: NCC or SSD, in color or grayscale. Then:
//   • the BEST agent is the guess
//   • the MARGIN (gap between 1st and 2nd place) is how sure we are
//
// Output (scripts/agent-match/data/):
//   step4-results.json   every crop's top 3 (used by step 5)
//   step4-matches.png    each crop above the icon it matched, with the margin
//   step4-unsure.png     the 20 least-sure crops, with their top 3

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { loadTemplates, prepCrop } from "../../src/lib/agents/prep";
import { rank, type Ranked } from "../../src/lib/agents/score";

const DATA = "scripts/agent-match/data";
const CROPS = join(DATA, "crops");
const templates = await loadTemplates();
console.log(`Loaded ${templates.size} agent templates.`);

type Result = { shot: string; file: string; side: string; variants: Record<string, Ranked> };
const VARIANTS = {
  "NCC color": ["ncc", false],
  "NCC gray": ["ncc", true],
  "SSD color": ["ssd", false],
  "SSD gray": ["ssd", true],
} as const;

// ---- Score everything ----
const results: Result[] = [];
const shots = readdirSync(CROPS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const t0 = Date.now();
for (const shot of shots) {
  for (const file of readdirSync(join(CROPS, shot)).sort()) {
    const crop = await prepCrop(join(CROPS, shot, file));
    const variants: Record<string, Ranked> = {};
    for (const [name, [method, gray]] of Object.entries(VARIANTS)) variants[name] = rank(crop, templates, method, gray);
    results.push({ shot, file, side: file.split("-")[1].replace(".png", ""), variants });
  }
}
console.log(`Scored ${results.length} crops × ${templates.size} agents × 4 variants in ${((Date.now() - t0) / 1000).toFixed(1)}s.\n`);

// Margin = how far ahead 1st place is. For SSD (lower = better) flip the sign.
const margin = (r: Ranked, variant: string) =>
  variant.startsWith("NCC") ? r[0].score - r[1].score : r[1].score - r[0].score;

// ---- Compare the four variants ----
const ref = "NCC color";
console.log("Variant      agrees w/ NCC color   typical best   typical margin   margins < 0.05");
for (const v of Object.keys(VARIANTS)) {
  const agree = results.filter((r) => r.variants[v][0].agent === r.variants[ref][0].agent).length;
  const bests = results.map((r) => r.variants[v][0].score).sort((a, b) => a - b);
  const margins = results.map((r) => margin(r.variants[v], v)).sort((a, b) => a - b);
  const med = (xs: number[]) => xs[xs.length >> 1];
  const small = v.startsWith("NCC") ? margins.filter((m) => m < 0.05).length : "–";
  console.log(
    `${v.padEnd(12)} ${`${agree}/${results.length}`.padStart(12)}        ${med(bests).toFixed(3).padStart(8)}        ${med(margins).toFixed(3).padStart(8)}        ${String(small).padStart(6)}`,
  );
}

// ---- How often each agent was picked (NCC color) ----
const counts = new Map<string, number>();
results.forEach((r) => counts.set(r.variants[ref][0].agent, (counts.get(r.variants[ref][0].agent) ?? 0) + 1));
console.log("\nPicks (NCC color):", [...counts].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(", "));

// ---- Least sure ----
const byMargin = [...results].sort((a, b) => margin(a.variants[ref], ref) - margin(b.variants[ref], ref));
console.log("\nLeast sure (NCC color):");
for (const r of byMargin.slice(0, 12)) {
  const top = r.variants[ref].slice(0, 3).map((x) => `${x.agent} ${x.score.toFixed(3)}`).join("  ");
  console.log(`  ${(r.shot + "/" + r.file).padEnd(36)} margin ${margin(r.variants[ref], ref).toFixed(3)}   ${top}`);
}

writeFileSync(
  join(DATA, "step4-results.json"),
  JSON.stringify(results.map((r) => ({ shot: r.shot, file: r.file, side: r.side, top3: r.variants[ref].slice(0, 3) })), null, 1),
);

// ---- Pictures ----
const T = 40; // thumbnail size
const iconThumb = new Map<string, Buffer>();
for (const a of templates.keys()) {
  iconThumb.set(a, await sharp(readFileSync(join(DATA, "icons", `${a}.png`))).resize(T, T).flatten({ background: "#333" }).png().toBuffer());
}
const text = (s: string, w: number, color = "#ccc", size = 10) =>
  Buffer.from(`<svg width="${w}" height="13"><text x="${w / 2}" y="10" font-family="Arial" font-size="${size}" fill="${color}" text-anchor="middle">${s}</text></svg>`);

// step4-matches.png: one line per screenshot; each cell = crop on top, matched icon below.
const CW = T + 14, CH = T * 2 + 28, LABEL = 150;
const over: sharp.OverlayOptions[] = [];
for (const [si, shot] of shots.entries()) {
  over.push({ input: text(shot, LABEL, "#ddd", 11), left: 0, top: si * CH + T });
  const rows = results.filter((r) => r.shot === shot);
  for (const [i, r] of rows.entries()) {
    const best = r.variants[ref][0];
    const m = margin(r.variants[ref], ref);
    const x = LABEL + i * CW, y = si * CH;
    over.push({ input: await sharp(readFileSync(join(CROPS, shot, r.file))).resize(T, T).png().toBuffer(), left: x, top: y });
    over.push({ input: iconThumb.get(best.agent)!, left: x, top: y + T + 2 });
    over.push({ input: text(best.agent, CW, "#eee"), left: x - 7, top: y + T * 2 + 3 });
    over.push({ input: text(m.toFixed(2), CW, m < 0.05 ? "#f87" : m < 0.1 ? "#fd6" : "#7d9"), left: x - 7, top: y + T * 2 + 14 });
  }
}
await sharp({ create: { width: LABEL + 10 * CW, height: shots.length * CH, channels: 3, background: "#1e2430" } })
  .composite(over).png().toFile(join(DATA, "step4-matches.png"));

// step4-unsure.png: the 20 least-sure crops with their top-3 icons and scores.
const U = byMargin.slice(0, 20);
const uo: sharp.OverlayOptions[] = [];
for (const [i, r] of U.entries()) {
  const y = i * (T + 18);
  uo.push({ input: await sharp(readFileSync(join(CROPS, r.shot, r.file))).resize(T, T).png().toBuffer(), left: 4, top: y });
  uo.push({ input: text(`${r.shot}/${r.file.slice(0, 5)}`, 120, "#aaa"), left: 0, top: y + T + 2 });
  r.variants[ref].slice(0, 3).forEach((c, k) => {
    uo.push({ input: iconThumb.get(c.agent)!, left: 140 + k * 110, top: y });
    uo.push({ input: text(`${c.agent} ${c.score.toFixed(3)}`, 104, k ? "#aaa" : "#fff"), left: 140 + k * 110 - 32, top: y + T + 2 });
  });
}
await sharp({ create: { width: 480, height: U.length * (T + 18), channels: 3, background: "#1e2430" } })
  .composite(uo).png().toFile(join(DATA, "step4-unsure.png"));
console.log(`\nSaved step4-results.json, step4-matches.png and step4-unsure.png to ${DATA}/`);
