// Find the rows on a Valorant Match Details scoreboard by the bright colored
// stripe at the start of each row (teal = ally, red = enemy, gold = screenshot owner).
// See scripts/agent-match/02-crop-portraits.mts for the walkthrough.

export type Row = { top: number; height: number; side: "ally" | "enemy" | "you" };
export type Layout = { stripeLeft: number; stripeRight: number; rows: Row[] };

/** Find the row stripe and the rows in one screenshot's raw pixels. */
export function findRows(data: Buffer, W: number, H: number, C: number): Layout | null {
  const px = (x: number, y: number) => {
    const i = (y * W + x) * C;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  // "Bright and colorful": the brightest channel is high, and the channels
  // differ a lot (gray/white/black have all three channels about equal).
  const vivid = (x: number, y: number) => {
    const [r, g, b] = px(x, y);
    const max = Math.max(r, g, b);
    return max > 120 && max - Math.min(r, g, b) > 90;
  };

  // 1. Score every column in the left 45% by how many vivid pixels it has.
  const score: number[] = [];
  for (let x = 0; x < W * 0.45; x++) {
    let n = 0;
    for (let y = 0; y < H; y++) if (vivid(x, y)) n++;
    score.push(n);
  }
  const best = Math.max(...score);
  if (best < H * 0.15) return null; // no stripe tall enough: probably a different layout
  // The stripe is several columns wide; keep the neighbors that score almost as high.
  const peak = score.indexOf(best);
  let stripeLeft = peak, stripeRight = peak;
  while (stripeLeft > 0 && score[stripeLeft - 1] > best * 0.8) stripeLeft--;
  while (stripeRight < score.length - 1 && score[stripeRight + 1] > best * 0.8) stripeRight++;
  const mid = (stripeLeft + stripeRight) >> 1;

  // 2. Walk down the middle of the stripe. Each unbroken vivid run is one row.
  const runs: { top: number; height: number }[] = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    const on = y < H && vivid(mid, y);
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      runs.push({ top: start, height: y - start });
      start = -1;
    }
  }
  // Ignore specks: real rows are all about the same height, so keep runs close
  // to the most common (median) height.
  const heights = runs.map((r) => r.height).sort((a, b) => a - b);
  const typical = heights[heights.length >> 1];
  const rows = runs
    .filter((r) => r.height > typical * 0.7 && r.height < typical * 1.3)
    .map((r): Row => {
      // 3. Team from the stripe's color in the middle of the row.
      const [red, green, blue] = px(mid, r.top + (r.height >> 1));
      const side = green > red + 40 ? "ally" : red > green + 40 && red > blue ? "enemy" : "you";
      return { ...r, side };
    });
  return { stripeLeft, stripeRight, rows };
}
