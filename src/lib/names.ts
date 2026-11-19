// Match names read from a screenshot to players on the rosters.

// Keep letters and digits from any script, so names like 原神职业哥 still match.
const norm = (s: string) => s.toLowerCase().replace(/#.*$/, "").replace(/[^\p{L}\p{N}]/gu, "");

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Lower is better; Infinity means no plausible match. */
export function nameDistance(read: string, riotName: string) {
  const a = norm(read);
  const b = norm(riotName);
  if (!a || !b) return Infinity;
  if (a === b) return 0;
  if (b.startsWith(a) || a.startsWith(b)) return 1; // truncated names
  const d = levenshtein(a, b);
  return d <= Math.max(1, Math.floor(b.length / 4)) ? 1 + d : Infinity;
}

/** Greedy best-first assignment so each roster player is used at most once. */
export function matchNames<P extends { id: string; riot_name: string }>(
  reads: string[],
  roster: P[],
): (P | null)[] {
  const pairs: { r: number; p: number; d: number }[] = [];
  reads.forEach((name, r) =>
    roster.forEach((pl, p) => {
      const d = nameDistance(name, pl.riot_name);
      if (d !== Infinity) pairs.push({ r, p, d });
    }),
  );
  pairs.sort((x, y) => x.d - y.d);
  const out: (P | null)[] = reads.map(() => null);
  const used = new Set<number>();
  for (const { r, p } of pairs) {
    if (out[r] || used.has(p)) continue;
    out[r] = roster[p];
    used.add(p);
  }
  return out;
}
