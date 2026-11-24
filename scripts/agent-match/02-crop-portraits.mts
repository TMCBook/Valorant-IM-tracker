// STEP 2 — Find each scoreboard row and cut out the agent portrait.
//
//   npm run agents:2 -- "<folder of screenshots>"
//
// Problem: every screenshot is a different size and crop (1784×675 up to
// 2564×1413), so fixed pixel positions can't work. We need a landmark.
//
// Landmark: each row on the Match Details screen starts with a thin, bright
// colored stripe (teal = your team, red = enemy, gold = you). It is the most
// saturated thing on the left side of the image, and it has a small gap
// between rows. So:
//   1. find the column(s) where that stripe is  → tells us where rows start (x)
//   2. walk down the stripe and record each solid run  → each row's top and height (y)
//   3. the portrait is the square just right of the stripe, as tall as the row
//
// Output (scripts/agent-match/data/crops/):
//   <screenshot>/row01.png …   one image per portrait, cut at full resolution
//   <screenshot>.png           the 10 portraits side by side, for checking by eye

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { findRows } from "../../src/lib/agents/rows";

const folder = process.argv[2];
if (!folder) throw new Error('Usage: npm run agents:2 -- "<folder>"');
const OUT = "scripts/agent-match/data/crops";
mkdirSync(OUT, { recursive: true });

const files = readdirSync(folder).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
const strips: { name: string; img: Buffer }[] = [];
const THUMB = 64;

for (const f of files) {
  const path = join(folder, f);
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const layout = findRows(data, info.width, info.height, info.channels);
  const name = basename(f, extname(f));
  if (!layout || layout.rows.length === 0) {
    console.log(`${f.padEnd(36)} ✗ couldn't find the row stripe`);
    continue;
  }
  const { stripeRight, rows } = layout;
  const flag = rows.length === 10 ? "✓" : "?";
  console.log(
    `${f.padEnd(36)} ${flag} ${rows.length} rows, ${rows[0].height}px tall, stripe at x=${layout.stripeLeft}–${stripeRight}  ` +
      rows.map((r) => r.side[0].toUpperCase()).join(""),
  );

  // Cut each portrait: starts just right of the stripe, square, as tall as the row.
  mkdirSync(join(OUT, name), { recursive: true });
  const thumbs: sharp.OverlayOptions[] = [];
  for (const [i, r] of rows.entries()) {
    const crop = await sharp(path)
      .extract({ left: stripeRight + 1, top: r.top, width: r.height, height: r.height })
      .png()
      .toBuffer();
    writeFileSync(join(OUT, name, `row${String(i + 1).padStart(2, "0")}-${r.side}.png`), crop);
    thumbs.push({ input: await sharp(crop).resize(THUMB, THUMB).toBuffer(), left: i * (THUMB + 4), top: 0 });
  }
  const strip = await sharp({
    create: { width: rows.length * (THUMB + 4), height: THUMB, channels: 3, background: "#111" },
  }).composite(thumbs).png().toBuffer();
  writeFileSync(join(OUT, `${name}.png`), strip);
  strips.push({ name: f, img: strip });
}

// One overview image: every screenshot's portraits, one screenshot per line.
const LABEL_W = 250, LINE = THUMB + 6;
const width = LABEL_W + 10 * (THUMB + 4);
await sharp({ create: { width, height: strips.length * LINE, channels: 3, background: "#1e2430" } })
  .composite(
    strips.flatMap((s, i) => [
      {
        input: Buffer.from(
          `<svg width="${LABEL_W}" height="${THUMB}"><text x="6" y="38" font-family="Arial" font-size="14" fill="#ccc">${s.name}</text></svg>`,
        ),
        left: 0,
        top: i * LINE,
      },
      { input: s.img, left: LABEL_W, top: i * LINE },
    ]),
  )
  .png()
  .toFile(join(OUT, "_all.png"));
console.log(`\nSaved crops to ${OUT}/ (open _all.png to see every portrait).`);
