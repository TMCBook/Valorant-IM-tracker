// STEP 4 — Scoring: how alike are a prepared crop and a prepared icon?
//
// Both functions only look at pixels inside the icon's mask, and both work on
// either color (3 values per pixel) or grayscale (1 value per pixel).

import type { Prepared } from "./prep";
import { toGray } from "./prep";

/** Pick out only the masked values, in color or gray. */
function masked(crop: Prepared, icon: Prepared, gray: boolean) {
  const a = gray ? toGray(crop.rgb) : crop.rgb;
  const b = gray ? toGray(icon.rgb) : icon.rgb;
  const per = gray ? 1 : 3; // numbers per pixel
  const xs: number[] = [], ys: number[] = [];
  icon.mask!.forEach((keep, p) => {
    if (!keep) return;
    for (let c = 0; c < per; c++) {
      xs.push(a[p * per + c]);
      ys.push(b[p * per + c]);
    }
  });
  return [xs, ys] as const;
}

/**
 * SSD — sum of squared differences, averaged per value so agents with small
 * masks aren't favored. 0 = identical. LOWER is better.
 */
export function ssd(crop: Prepared, icon: Prepared, gray = false) {
  const [xs, ys] = masked(crop, icon, gray);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - ys[i]) ** 2;
  return s / xs.length;
}

/**
 * NCC — normalized cross-correlation. From −1 to 1; 1 = same pattern. HIGHER is better.
 *
 *   1. subtract each image's average  → a uniformly darker screenshot no longer matters
 *   2. divide by each image's spread  → lower contrast no longer matters
 *   3. average the products           → do light/dark parts line up in the same places?
 */
export function ncc(crop: Prepared, icon: Prepared, gray = false) {
  const [xs, ys] = masked(crop, icon, gray);
  const n = xs.length;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / n;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

export type Ranked = { agent: string; score: number }[];

/**
 * STEP 5 — When to trust a pick (NCC, color).
 *
 * Measured on 280 portraits from 28 screenshots: every pick was correct
 * (147 agreed with Claude, 21 disagreed and the matcher was right each time
 * when checked by eye, 112 filled Claude's blanks). The least-sure correct
 * pick still had best = 0.55 and margin = 0.19.
 *
 * The cutoffs sit well below those numbers, leaving room for blurrier images
 * we haven't seen yet. Anything under them is left blank for a person.
 */
export const ACCEPT_MIN_SCORE = 0.45;
export const ACCEPT_MIN_MARGIN = 0.1;

/** The agent to save, or null if the matcher isn't sure enough. */
export function confidentPick(r: Ranked) {
  const [first, second] = r;
  return first.score >= ACCEPT_MIN_SCORE && first.score - second.score >= ACCEPT_MIN_MARGIN ? first.agent : null;
}

/** Score a crop against every template and sort best-first. */
export function rank(
  crop: Prepared,
  templates: Map<string, Prepared>,
  method: "ncc" | "ssd" = "ncc",
  gray = false,
): Ranked {
  const out = [...templates].map(([agent, icon]) => ({
    agent,
    score: method === "ncc" ? ncc(crop, icon, gray) : ssd(crop, icon, gray),
  }));
  return out.sort((a, b) => (method === "ncc" ? b.score - a.score : a.score - b.score));
}
