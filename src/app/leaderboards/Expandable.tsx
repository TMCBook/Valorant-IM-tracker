"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

export type Entry = { id: string; name: string; team: string | null; value: string; detail?: string; href?: string };

/** A top-5 board with a "Show all" button that reveals the full ranking. */
export function Board({ title, note, entries, top = 5 }: { title: string; note?: string; entries: Entry[]; top?: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? entries : entries.slice(0, top);
  return (
    <div className="card flex flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {note && <span className="text-xs text-zinc-500">{note}</span>}
      </div>
      {entries.length ? (
        <ol className={`space-y-2 ${open ? "max-h-96 overflow-y-auto pr-1" : ""}`}>
          {shown.map((e, i) => (
            <li key={e.id + i} className="flex items-center gap-3 text-sm">
              <span className={`w-6 text-right tabular-nums ${i === 0 ? "font-bold text-amber-300" : "text-zinc-500"}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={e.href ?? "#"} className="block truncate font-medium hover:text-rose-400">{e.name}</Link>
                <div className="truncate text-xs text-zinc-500">{[e.team, e.detail].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="tabular-nums font-semibold">{e.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-zinc-500">Not enough games yet.</p>
      )}
      {entries.length > top && (
        <button onClick={() => setOpen((o) => !o)} className="btn btn-secondary btn-sm mt-3 self-start">
          {open ? "Show top 5" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}

export type RankRow = { id: string; name: string; team: string | null; maps: number; kd: string; kpm: string; winPct: string; fb: number };
export type Breakdown = {
  key: string;
  label: React.ReactNode;  // e.g. agent icon + name, rendered on the server
  totalMaps: number;
  leader: RankRow | null;  // best K/D with enough maps
  ranking: RankRow[];      // everyone, qualified first
  minMaps: number;
};

/**
 * One row per map or agent showing its leader; click a row to open that
 * map's/agent's full leaderboard underneath.
 */
export function BreakdownTable({ firstColumn, rows }: { firstColumn: string; rows: Breakdown[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="card overflow-x-auto">
      <table className="stat-table">
        <thead>
          <tr>
            <th>{firstColumn}</th><th className="!text-left">Best player</th><th>K/D</th><th>Their maps</th>
            <th>Total maps</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = open === r.key;
            return (
              <Fragment key={r.key}>
                <tr
                  onClick={() => setOpen(isOpen ? null : r.key)}
                  className={`cursor-pointer hover:bg-zinc-800/40 ${isOpen ? "bg-zinc-800/40" : ""}`}
                  aria-expanded={isOpen}
                >
                  <td>{r.label}</td>
                  <td className="!text-left">{r.leader ? r.leader.name : <span className="text-zinc-500">–</span>}</td>
                  <td className="font-semibold">{r.leader?.kd ?? "–"}</td>
                  <td>{r.leader?.maps ?? "–"}</td>
                  <td className="text-zinc-500">{r.totalMaps}</td>
                  <td>
                    <span className="btn btn-secondary btn-sm">{isOpen ? "Hide" : `All ${r.ranking.length}`}</span>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6} className="!p-0">
                      <div className="border-y border-zinc-800 bg-zinc-950/60 px-3 py-3">
                        <table className="stat-table">
                          <thead>
                            <tr><th>#</th><th className="!text-left">Player</th><th className="!text-left">Team</th><th>Maps</th><th>K/D</th><th>Kills/map</th><th>Win %</th><th>FB</th></tr>
                          </thead>
                          <tbody>
                            {r.ranking.map((p, i) => {
                              const thin = p.maps < r.minMaps;
                              return (
                                <tr key={p.id} className={thin ? "text-zinc-500" : ""}>
                                  <td className={i === 0 && !thin ? "font-bold text-amber-300" : "text-zinc-500"}>{i + 1}</td>
                                  <td className="!text-left"><Link href={`/players/${p.id}`} className="hover:text-rose-400">{p.name}</Link></td>
                                  <td className="!text-left text-zinc-400">{p.team ?? "–"}</td>
                                  <td>{p.maps}</td><td className="font-semibold">{p.kd}</td><td>{p.kpm}</td><td>{p.winPct}</td><td>{p.fb}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="mt-2 text-xs text-zinc-500">Greyed out: fewer than {r.minMaps} maps, so not ranked for the top spot.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
