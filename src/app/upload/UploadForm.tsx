"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveMatchMap, type SaveMapInput } from "@/app/actions";
import { matchNames } from "@/lib/names";
import type { ParsedScoreboard } from "@/lib/scoreboard";
import type { Match, Player, Team } from "@/lib/types";

const AGENTS = [
  "Astra", "Breach", "Brimstone", "Chamber", "Clove", "Cypher", "Deadlock", "Fade", "Gekko",
  "Harbor", "Iso", "Jett", "KAY/O", "Killjoy", "Neon", "Omen", "Phoenix", "Raze", "Reyna",
  "Sage", "Skye", "Sova", "Tejo", "Vyse", "Viper", "Waylay", "Yoru",
];
const MAPS = [
  "Abyss", "Ascent", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox", "Lotus",
  "Pearl", "Split", "Summit", "Sunset",
];

type Side = "ally" | "enemy";
type Row = {
  side: Side;
  readName: string;
  playerId: string; // "" = unset, "new" = create, "skip" = sub, not recorded
  newName: string;
  newTag: string;
  agent: string;
  acs: string;
  kills: string;
  deaths: string;
  assists: string;
  econ: string;
  firstBloods: string;
  plants: string;
  defuses: string;
};

const NUM_FIELDS = [
  ["acs", "ACS"],
  ["kills", "K"],
  ["deaths", "D"],
  ["assists", "A"],
  ["econ", "Econ"],
  ["firstBloods", "FB"],
  ["plants", "Pl"],
  ["defuses", "Df"],
] as const;

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number.parseInt(s, 10));

/** Shrink big phone photos so uploads stay fast and under size limits. */
async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process image"))), "image/jpeg", 0.9),
  );
}

function blankRow(side: Side): Row {
  return {
    side, readName: "", playerId: "", newName: "", newTag: "", agent: "",
    acs: "", kills: "", deaths: "", assists: "", econ: "", firstBloods: "", plants: "", defuses: "",
  };
}

export default function UploadForm({
  matches,
  teams,
  players,
  initialMatchId,
}: {
  matches: Match[];
  teams: Team[];
  players: Player[];
  initialMatchId?: string;
}) {
  const router = useRouter();
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";

  const [matchId, setMatchId] = useState(initialMatchId ?? "");
  const [mapNumber, setMapNumber] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [allyIsA, setAllyIsA] = useState(true);
  const [mapName, setMapName] = useState("");
  const [allyRounds, setAllyRounds] = useState("");
  const [enemyRounds, setEnemyRounds] = useState("");
  const [seriesComplete, setSeriesComplete] = useState(false);

  const match = matches.find((m) => m.id === matchId);
  const roster = useMemo(() => {
    const by = (teamId?: string) => players.filter((p) => p.team_id === teamId);
    return { a: by(match?.team_a_id), b: by(match?.team_b_id) };
  }, [players, match]);
  const teamFor = (side: Side) =>
    (side === "ally") === allyIsA ? match?.team_a_id ?? "" : match?.team_b_id ?? "";
  const rosterFor = (side: Side) => ((side === "ally") === allyIsA ? roster.a : roster.b);

  function buildRows(parsed: ParsedScoreboard) {
    const ally = parsed.players.filter((p) => p.side === "ally");
    const enemy = parsed.players.filter((p) => p.side === "enemy");
    const hits = (reads: typeof ally, r: Player[]) =>
      matchNames(reads.map((p) => p.name), r).filter(Boolean).length;
    // Decide which screenshot side is which team by how many names match each roster.
    const aFirst = hits(ally, roster.a) + hits(enemy, roster.b);
    const bFirst = hits(ally, roster.b) + hits(enemy, roster.a);
    const isA = aFirst >= bFirst;
    setAllyIsA(isA);

    const toRows = (reads: typeof ally, side: Side, r: Player[]) => {
      const found = matchNames(reads.map((p) => p.name), r);
      return reads.map((p, i) => ({
        side,
        readName: p.name,
        playerId: found[i]?.id ?? "skip", // not on this team's roster = sub
        newName: p.name.replace(/#.*$/, ""),
        newTag: p.name.includes("#") ? p.name.split("#")[1] : "",
        agent: p.agent ?? "",
        acs: str(p.acs),
        kills: str(p.kills),
        deaths: str(p.deaths),
        assists: str(p.assists),
        econ: str(p.econ),
        firstBloods: str(p.first_bloods),
        plants: str(p.plants),
        defuses: str(p.defuses),
      }));
    };
    setRows([
      ...toRows(ally, "ally", isA ? roster.a : roster.b),
      ...toRows(enemy, "enemy", isA ? roster.b : roster.a),
    ]);
    setMapName(parsed.map ?? "");
    setAllyRounds(str(parsed.ally_rounds));
    setEnemyRounds(str(parsed.enemy_rounds));
    setNotes(parsed.notes ?? "");
  }

  async function readScreenshot() {
    if (!file || !matchId) return setError("Pick a match and a screenshot first.");
    setError("");
    setBusy("reading");
    try {
      const blob = await shrinkImage(file);
      setPreview(URL.createObjectURL(blob));
      const fd = new FormData();
      fd.append("file", new File([blob], "scoreboard.jpg", { type: "image/jpeg" }));
      fd.append("matchId", matchId);
      const res = await fetch("/api/parse-scoreboard", { method: "POST", body: fd });
      const data = await res.json();
      if (data.screenshotPath) setScreenshotPath(data.screenshotPath);
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (!data.parsed.is_scoreboard || data.parsed.players.length === 0) {
        throw new Error("That doesn't look like a Valorant scoreboard. You can enter stats manually instead.");
      }
      buildRows(data.parsed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function enterManually() {
    if (!matchId) return setError("Pick a match first.");
    setError("");
    setRows([...Array(5)].map(() => blankRow("ally")).concat([...Array(5)].map(() => blankRow("enemy"))));
  }

  /** Flip which team is green/red, re-matching names against the other rosters. */
  function swapTeams() {
    const nextIsA = !allyIsA;
    setAllyIsA(nextIsA);
    setRows((rs) => {
      if (!rs) return rs;
      const out = rs.map((r) => ({ ...r }));
      for (const side of ["ally", "enemy"] as const) {
        const r = (side === "ally") === nextIsA ? roster.a : roster.b;
        const idx = out.flatMap((row, i) => (row.side === side ? [i] : []));
        const found = matchNames(idx.map((i) => out[i].readName), r);
        idx.forEach((i, k) => (out[i].playerId = found[k]?.id ?? (out[i].readName ? "skip" : "")));
      }
      return out;
    });
  }

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    if (!rows || !match) return;
    const a = num(allyIsA ? allyRounds : enemyRounds);
    const b = num(allyIsA ? enemyRounds : allyRounds);
    if (a == null || b == null) return setError("Enter the round score for both teams.");
    const kept = rows.filter((r) => r.playerId !== "skip");
    if (kept.length < 2) return setError("At least two rostered players are needed to save a map.");
    for (const r of kept) {
      if (!r.playerId) return setError("Pick a player for every row.");
      if (r.playerId === "new" && !r.newName.trim()) return setError("New players need a name.");
      if ([r.kills, r.deaths, r.assists].some((v) => num(v) == null)) {
        return setError(`K/D/A is missing for ${r.newName || r.readName || "a player"}.`);
      }
    }
    const input: SaveMapInput = {
      matchId,
      mapNumber,
      mapName: mapName || null,
      teamARounds: a,
      teamBRounds: b,
      screenshotPath,
      seriesComplete,
      rows: kept.map((r) => ({
        playerId: r.playerId === "new" ? null : r.playerId,
        newName: r.playerId === "new" ? r.newName.trim() : null,
        newTag: r.playerId === "new" ? r.newTag.trim() || null : null,
        teamId: teamFor(r.side),
        agent: r.agent || null,
        acs: num(r.acs),
        kills: num(r.kills)!,
        deaths: num(r.deaths)!,
        assists: num(r.assists)!,
        econ: num(r.econ),
        firstBloods: num(r.firstBloods),
        plants: num(r.plants),
        defuses: num(r.defuses),
      })),
    };
    setBusy("saving");
    setError("");
    const res = await saveMatchMap(input);
    setBusy("");
    if (!res.ok) return setError(res.error);
    router.push(`/matches/${matchId}`);
  }

  const input = "rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-sm";

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Match
          <select className={input} value={matchId} onChange={(e) => { setMatchId(e.target.value); setRows(null); }}>
            <option value="">Choose a match…</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {teamName(m.team_a_id)} vs {teamName(m.team_b_id)}
                {m.round_label ? ` · ${m.round_label}` : ""}
                {m.status === "completed" ? " · completed" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Map # in series
          <select className={input} value={mapNumber} onChange={(e) => setMapNumber(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Map {n}</option>)}
          </select>
        </label>
      </section>

      {!rows && (
        <section className="space-y-3 rounded-lg border border-dashed border-zinc-700 p-4">
          <p className="text-sm text-zinc-400">
            Upload the end-of-match scoreboard (the tab that lists ACS, K/D/A, econ, first bloods). A phone photo works.
          </p>
          <input
            type="file"
            accept="image/*"
            className="block text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-3">
            <button
              onClick={readScreenshot}
              disabled={!!busy}
              className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500 disabled:opacity-50"
            >
              {busy === "reading" ? "Reading scoreboard… (~20s)" : "Read screenshot"}
            </button>
            <button onClick={enterManually} className="text-sm text-zinc-400 underline">
              Enter manually instead
            </button>
          </div>
        </section>
      )}

      {error && <p className="rounded bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      {rows && match && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              Map
              <input list="maps" className={input} value={mapName} onChange={(e) => setMapName(e.target.value)} />
              <datalist id="maps">{MAPS.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
            <button
              onClick={swapTeams}
              className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
            >
              ⇄ Swap teams
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={seriesComplete} onChange={(e) => setSeriesComplete(e.target.checked)} />
              This was the last map of the series
            </label>
          </div>

          {notes && <p className="rounded bg-amber-950 p-3 text-sm text-amber-200">Double-check: {notes}</p>}

          {(["ally", "enemy"] as const).map((side) => (
            <div key={side} className="overflow-x-auto rounded-lg border border-zinc-800">
              <div className="flex items-center gap-3 bg-zinc-900 px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${side === "ally" ? "bg-teal-400" : "bg-red-400"}`} />
                <span className="font-semibold">{teamName(teamFor(side))}</span>
                <span className="text-xs text-zinc-500">({side === "ally" ? "green/top" : "red/bottom"} on screenshot)</span>
                <label className="ml-auto flex items-center gap-2 text-sm">
                  Rounds won
                  <input
                    className={`${input} w-14`}
                    inputMode="numeric"
                    value={side === "ally" ? allyRounds : enemyRounds}
                    onChange={(e) => (side === "ally" ? setAllyRounds : setEnemyRounds)(e.target.value)}
                  />
                </label>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="p-2 text-left">Player</th>
                    <th className="p-2 text-left">Agent</th>
                    {NUM_FIELDS.map(([, label]) => <th key={label} className="p-2">{label}</th>)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) =>
                    r.side !== side ? null : (
                      <tr key={i} className={`border-t border-zinc-800 ${r.playerId === "skip" ? "opacity-40" : ""}`}>
                        <td className="p-2">
                          {r.readName && <div className="text-xs text-zinc-500">read: {r.readName}</div>}
                          <select
                            className={`${input} w-44`}
                            value={r.playerId}
                            onChange={(e) => update(i, { playerId: e.target.value })}
                          >
                            <option value="">Choose…</option>
                            {rosterFor(side).map((p) => (
                              <option key={p.id} value={p.id}>{p.riot_name}{p.riot_tag ? `#${p.riot_tag}` : ""}</option>
                            ))}
                            <option value="skip">Sub (don&apos;t record)</option>
                            <option value="new">+ New player</option>
                          </select>
                          {r.playerId === "new" && (
                            <div className="mt-1 flex gap-1">
                              <input className={`${input} w-40`} placeholder="Name" value={r.newName}
                                onChange={(e) => update(i, { newName: e.target.value })} />
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <input list="agents" className={`${input} w-24`} value={r.agent}
                            onChange={(e) => update(i, { agent: e.target.value })} />
                        </td>
                        {NUM_FIELDS.map(([key]) => (
                          <td key={key} className="p-1">
                            <input className={`${input} w-14 text-center`} inputMode="numeric" value={r[key]}
                              onChange={(e) => update(i, { [key]: e.target.value })} />
                          </td>
                        ))}
                        <td className="p-2 whitespace-nowrap">
                          <button title="Move to other team" className="text-zinc-500 hover:text-white"
                            onClick={() => update(i, { side: side === "ally" ? "enemy" : "ally", playerId: "" })}>⇅</button>
                          <button title="Remove row" className="ml-2 text-zinc-500 hover:text-red-400"
                            onClick={() => setRows((rs) => rs!.filter((_, j) => j !== i))}>✕</button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              <button className="px-3 py-2 text-xs text-zinc-400 hover:text-white"
                onClick={() => setRows((rs) => [...rs!, blankRow(side)])}>+ Add row</button>
            </div>
          ))}
          <datalist id="agents">{AGENTS.map((a) => <option key={a} value={a} />)}</datalist>

          <div className="flex items-center gap-4">
            <button
              onClick={save}
              disabled={!!busy}
              className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-500 disabled:opacity-50"
            >
              {busy === "saving" ? "Saving…" : "Save map"}
            </button>
            <button onClick={() => { setRows(null); setScreenshotPath(null); setPreview(null); }}
              className="text-sm text-zinc-400 underline">Start over</button>
          </div>

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Uploaded scoreboard" className="max-h-[500px] rounded border border-zinc-800" />
          )}
        </section>
      )}
    </div>
  );
}
