// STEP 1 — Download the official agent icons (our "templates").
//
//   npm run agents:1
//
// Every agent has exactly one scoreboard portrait, and it never changes with
// skins. valorant-api.com (a free community site) hosts those portraits, so
// they become the 28 reference images we compare scoreboard crops against.
//
// Output (in scripts/agent-match/data/, not committed to git):
//   icons/<Agent>.png       the raw templates
//   sheet.png               all icons in a grid, so you can eyeball them
//   alpha-<Agent>.png       one icon's transparency mask, shown as black/white

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT = "scripts/agent-match/data";
mkdirSync(join(OUT, "icons"), { recursive: true });

// 1. Ask the API for the list of playable agents.
type Agent = { displayName: string; displayIcon: string };
const res = await fetch("https://valorant-api.com/v1/agents?isPlayableCharacter=true");
const agents = ((await res.json()).data as Agent[]).sort((a, b) => a.displayName.localeCompare(b.displayName));
console.log(`Found ${agents.length} agents.\n`);

// 2. Download each icon. A PNG file is the pixel grid, compressed.
for (const a of agents) {
  const png = Buffer.from(await (await fetch(a.displayIcon)).arrayBuffer());
  const file = join(OUT, "icons", `${a.displayName.replace("/", "")}.png`); // KAY/O -> KAYO
  writeFileSync(file, png);
}

// 3. Look inside one image. "channels: 4" means each pixel is 4 numbers:
//    Red, Green, Blue, and Alpha (how opaque the pixel is, 0 = invisible).
const sample = join(OUT, "icons", "Jett.png");
const meta = await sharp(sample).metadata();
console.log(`Jett.png is ${meta.width}×${meta.height} pixels, ${meta.channels} channels (${meta.hasAlpha ? "has" : "no"} alpha).`);

// Read the raw numbers and print a few pixels so you can see what an image *is*.
const { data, info } = await sharp(sample).raw().toBuffer({ resolveWithObject: true });
const px = (x: number, y: number) => {
  const i = (y * info.width + x) * info.channels; // pixels are stored row by row
  return `(${x},${y}) → R${data[i]} G${data[i + 1]} B${data[i + 2]} A${data[i + 3]}`;
};
console.log("  corner:", px(2, 2), "  ← alpha 0: transparent background");
console.log("  center:", px(info.width >> 1, info.height >> 1), "  ← part of the face");
let opaque = 0;
for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
console.log(`  ${Math.round((100 * opaque) / (info.width * info.height))}% of pixels are face; the rest is transparent.\n`);

// 4. Save the alpha channel as its own image: white = face, black = background.
//    This is the "mask" we'll use later to ignore the row's teal/red/gold color.
await sharp(sample).extractChannel("alpha").toFile(join(OUT, "alpha-Jett.png"));

// 5. Contact sheet: every icon on a dark tile with its name, 7 per row.
const TILE = 96, COLS = 7, LABEL = 18;
const rows = Math.ceil(agents.length / COLS);
const tiles = await Promise.all(
  agents.map(async (a, i) => {
    const name = a.displayName.replace("/", "");
    const icon = await sharp(join(OUT, "icons", `${name}.png`)).resize(TILE - 16, TILE - 16).toBuffer();
    const label = Buffer.from(
      `<svg width="${TILE}" height="${LABEL}"><text x="50%" y="13" font-family="Arial" font-size="12" fill="#ddd" text-anchor="middle">${a.displayName}</text></svg>`,
    );
    const x = (i % COLS) * TILE, y = Math.floor(i / COLS) * (TILE + LABEL);
    return [
      { input: icon, left: x + 8, top: y + 4 },
      { input: label, left: x, top: y + TILE - 6 },
    ];
  }),
);
await sharp({ create: { width: COLS * TILE, height: rows * (TILE + LABEL), channels: 3, background: "#1e2430" } })
  .composite(tiles.flat())
  .png()
  .toFile(join(OUT, "sheet.png"));
console.log(`Saved ${agents.length} icons, sheet.png and alpha-Jett.png to ${OUT}/`);
