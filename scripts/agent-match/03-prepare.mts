// STEP 3 — See what "preparing" does to a portrait and an icon.
//
//   npm run agents:3
//
// For a few portraits from image7.png, paired with the agent we think they
// are, this saves one picture per pair showing every stage side by side:
//
//   crop │ crop 48×48 │ icon 48×48 │ mask │ crop+mask │ icon+mask │ gray crop+mask │ gray icon+mask
//
// If preparing works, the last pairs should look almost identical. The
// background tint is hidden by the mask and the sizes match.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { N, grayPng, prepCrop, prepTemplate, toGray, toPng } from "../../src/lib/agents/prep";

const CROPS = "scripts/agent-match/data/crops/image7";
const ICONS = "scripts/agent-match/data/icons";
const OUT = "scripts/agent-match/data";

// Row number → agent we believe it is (by eye from _all.png). Step 4 will check these.
const examples: [number, string][] = [
  [5, "Hush"],
  [3, "Skye"],
  [6, "Gekko"],
  [8, "Omen"],
];

const files = readdirSync(CROPS);
const S = 3, CELL = N * S, GAP = 6;
const headers = ["crop", "crop 48²", "icon 48²", "mask", "crop+mask", "icon+mask", "gray crop", "gray icon"];
const panels: sharp.OverlayOptions[] = [];
headers.forEach((h, i) =>
  panels.push({
    input: Buffer.from(`<svg width="${CELL}" height="20"><text x="50%" y="14" font-family="Arial" font-size="12" fill="#bbb" text-anchor="middle">${h}</text></svg>`),
    left: 90 + i * (CELL + GAP),
    top: 0,
  }),
);

for (const [i, [row, agent]] of examples.entries()) {
  const file = files.find((f) => f.startsWith(`row${String(row).padStart(2, "0")}`))!;
  const cropPath = join(CROPS, file);
  const crop = await prepCrop(cropPath);
  const icon = await prepTemplate(join(ICONS, `${agent}.png`));
  const mask = icon.mask!;

  const cells = [
    await sharp(cropPath).resize(CELL, CELL, { kernel: "nearest" }).png().toBuffer(), // original pixels, just enlarged
    await toPng(crop.rgb, undefined, S),
    await toPng(icon.rgb, undefined, S),
    await grayPng(Float32Array.from(mask), undefined, S),
    await toPng(crop.rgb, mask, S),
    await toPng(icon.rgb, mask, S),
    await grayPng(toGray(crop.rgb), mask, S),
    await grayPng(toGray(icon.rgb), mask, S),
  ];
  const top = 24 + i * (CELL + GAP);
  panels.push({
    input: Buffer.from(`<svg width="85" height="${CELL}"><text x="4" y="${CELL / 2}" font-family="Arial" font-size="13" fill="#eee">row ${row}</text><text x="4" y="${CELL / 2 + 18}" font-family="Arial" font-size="12" fill="#8cf">${agent}?</text></svg>`),
    left: 0,
    top,
  });
  cells.forEach((c, j) => panels.push({ input: c, left: 90 + j * (CELL + GAP), top }));

  const kept = mask.reduce((s, m) => s + m, 0);
  console.log(`row ${row} vs ${agent}: mask keeps ${kept} of ${N * N} pixels (${Math.round((100 * kept) / (N * N))}%)`);
}

const width = 90 + headers.length * (CELL + GAP);
const height = 24 + examples.length * (CELL + GAP);
await sharp({ create: { width, height, channels: 3, background: "#1e2430" } })
  .composite(panels)
  .png()
  .toFile(join(OUT, "step3-prepare.png"));
console.log(`\nSaved ${OUT}/step3-prepare.png`);
