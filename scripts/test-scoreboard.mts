// Run the screenshot reader on one image and, optionally, grade it against
// the correct answers.
//
//   npm run test:scoreboard -- <image> [expected.json]
//
// Needs ANTHROPIC_API_KEY in .env.local. Each run costs about a cent.

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parseScoreboard, type ParsedScoreboard } from "../src/lib/scoreboard";

const [image, expectedPath] = process.argv.slice(2);
if (!image) {
  console.error("Usage: npm run test:scoreboard -- <image> [expected.json]");
  process.exit(1);
}

const types = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as const;
const mediaType = types[extname(image).toLowerCase() as keyof typeof types];
if (!mediaType) throw new Error("Use a .png, .jpg or .webp image.");
const bytes = readFileSync(image);
if (bytes.length > 5 * 1024 * 1024) throw new Error("Image is over 5 MB. Resize it first.");

const started = Date.now();
const got = await parseScoreboard(bytes.toString("base64"), mediaType);
console.log(`Read in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
console.log(JSON.stringify(got, null, 2));
if (!expectedPath) process.exit(0);

// ---- Grade ----
type Expected = Omit<ParsedScoreboard, "players" | "is_scoreboard" | "notes"> & {
  players: (Partial<ParsedScoreboard["players"][number]> & { name: string })[];
};
const want = JSON.parse(readFileSync(expectedPath, "utf8")) as Expected;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const problems: string[] = [];
let checked = 0;

const check = (label: string, expected: unknown, actual: unknown) => {
  checked++;
  if (expected !== actual) problems.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

check("map", want.map, got.map);
check("ally_rounds", want.ally_rounds, got.ally_rounds);
check("enemy_rounds", want.enemy_rounds, got.enemy_rounds);
check("player count", want.players.length, got.players.length);

for (const w of want.players) {
  const g = got.players.find((p) => norm(p.name) === norm(w.name));
  checked++;
  if (!g) {
    problems.push(`missing player "${w.name}"`);
    continue;
  }
  if (g.name !== w.name) problems.push(`name: expected "${w.name}", got "${g.name}" (matched loosely)`);
  for (const key of ["side", "agent", "acs", "kills", "deaths", "assists", "econ", "first_bloods", "plants", "defuses"] as const) {
    if (key in w) check(`${w.name}.${key}`, w[key], g[key]);
  }
}

const score = checked - problems.length;
console.log(`\n${score}/${checked} fields correct`);
if (problems.length) {
  console.log("\nMismatches:");
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
} else {
  console.log("All correct.");
}
