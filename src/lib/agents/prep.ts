// STEP 3 — Prepare images so a portrait and an icon can be compared fairly.
//
// Both sides become the same thing: an N×N grid of numbers (0–1) for the
// red, green and blue channels, plus a MASK saying which pixels to compare.
//
//   template (official icon)          crop (from a scoreboard)
//   1024×1024, transparent bg   →     46–62 px, teal/red/gold bg
//            ↓ shrink to N×N                  ↓ shrink to N×N
//   pixels + mask from alpha          pixels (no mask of its own)
//
// When we compare a crop against agent X, we only look at pixels inside
// agent X's mask, so the row's background color never counts.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

export const N = 48; // comparison size: small enough to ignore fine detail

export type Prepared = {
  rgb: Float32Array; // N*N*3 values, each 0..1, row by row: R,G,B, R,G,B, …
  mask?: Uint8Array; // N*N values: 1 = compare this pixel, 0 = ignore (templates only)
};

// sharp caches open files; on Windows that can make it report files as
// "missing" after many reads. Turn the cache off and read bytes ourselves.
sharp.cache(false);

/** Shrink an image to N×N and return its pixels as 0..1 numbers (+ alpha if present). */
async function shrink(input: string | Buffer) {
  const bytes = typeof input === "string" ? readFileSync(input) : input;
  const { data, info } = await sharp(bytes)
    .resize(N, N, { fit: "fill", kernel: "lanczos3" }) // lanczos = smooth, high-quality shrink
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, channels: info.channels }; // channels = 4 (RGBA)
}

/** A scoreboard crop: just its pixels. */
export async function prepCrop(input: string | Buffer): Promise<Prepared> {
  const { data } = await shrink(input);
  const rgb = new Float32Array(N * N * 3);
  for (let p = 0; p < N * N; p++) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = data[p * 4 + c] / 255;
  return { rgb };
}

/**
 * An official icon: its pixels plus a mask built from transparency.
 * We keep only pixels that are almost fully solid (alpha > 90%). The soft
 * edge pixels are a blend of face and background once shrunk, so leaving them
 * out (a slightly smaller "eroded" mask) makes comparisons cleaner.
 */
export async function prepTemplate(input: string | Buffer): Promise<Prepared> {
  const { data } = await shrink(input);
  const rgb = new Float32Array(N * N * 3);
  const mask = new Uint8Array(N * N);
  for (let p = 0; p < N * N; p++) {
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = data[p * 4 + c] / 255;
    mask[p] = data[p * 4 + 3] > 230 ? 1 : 0;
  }
  return { rgb, mask };
}

/** Load every icon in a folder as { agentName: Prepared }. */
export async function loadTemplates(dir = "scripts/agent-match/data/icons") {
  const out = new Map<string, Prepared>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
    out.set(basename(f, ".png"), await prepTemplate(join(dir, f)));
  }
  return out;
}

/** Grayscale = perceived brightness. Green looks brightest to human eyes, blue darkest. */
export function toGray(rgb: Float32Array) {
  const g = new Float32Array(rgb.length / 3);
  for (let p = 0; p < g.length; p++) g[p] = 0.299 * rgb[p * 3] + 0.587 * rgb[p * 3 + 1] + 0.114 * rgb[p * 3 + 2];
  return g;
}

/** Turn prepared pixels back into a PNG (scaled up so you can see it). Masked-out pixels show as checkerboard. */
export async function toPng(rgb: Float32Array, mask?: Uint8Array, scale = 3) {
  const raw = Buffer.alloc(N * N * 3);
  for (let p = 0; p < N * N; p++) {
    const x = p % N, y = Math.floor(p / N);
    const hidden = mask && !mask[p];
    const checker = ((x >> 2) + (y >> 2)) % 2 ? 60 : 90;
    for (let c = 0; c < 3; c++) raw[p * 3 + c] = hidden ? checker : Math.round(rgb[p * 3 + c] * 255);
  }
  return sharp(raw, { raw: { width: N, height: N, channels: 3 } })
    .resize(N * scale, N * scale, { kernel: "nearest" }) // nearest = keep the blocky pixels visible
    .png()
    .toBuffer();
}

/** Same as toPng but for a single gray channel. */
export async function grayPng(gray: Float32Array, mask?: Uint8Array, scale = 3) {
  const rgb = new Float32Array(gray.length * 3);
  gray.forEach((v, p) => rgb.fill(v, p * 3, p * 3 + 3));
  return toPng(rgb, mask, scale);
}
