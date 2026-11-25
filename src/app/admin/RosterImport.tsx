"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyRosterAction, previewRosterAction } from "@/app/actions";
import type { Plan } from "@/lib/roster-import";

const field = "rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";

/** Upload a sign-up sheet → preview the changes → confirm. */
export default function RosterImport({ currentSeason }: { currentSeason: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"new" | "update">("update");
  const [seasonName, setSeasonName] = useState("");
  // A fresh season's sheet has current Riot IDs; an old sheet mid-season may not.
  const [updateIds, setUpdateIds] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const formData = () => {
    const fd = new FormData(formRef.current!);
    fd.set("mode", mode);
    fd.set("seasonName", seasonName);
    fd.set("updateIds", updateIds ? "on" : "");
    return fd;
  };

  function preview() {
    setMsg(null);
    start(async () => {
      const r = await previewRosterAction(formData());
      if (r.ok) setPlan(r.plan);
      else { setPlan(null); setMsg({ ok: false, text: r.error }); }
    });
  }

  function apply() {
    if (!plan) return;
    const warn = mode === "new"
      ? `Archive ${currentSeason} and start ${plan.seasonName}?\n\n${currentSeason} stays viewable as an archived season, but uploads and rosters move to ${plan.seasonName}.`
      : `Replace the ${currentSeason} rosters with this sheet?`;
    if (!confirm(warn)) return;
    start(async () => {
      const r = await applyRosterAction(formData());
      setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Done." : r.error });
      if (r.ok) { setPlan(null); formRef.current?.reset(); router.refresh(); }
    });
  }

  const blocking = plan?.warnings.filter((w) => /No team blocks|Enter a name|already exists|listed twice/.test(w)) ?? [];

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); preview(); }} className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "update"} onChange={() => { setMode("update"); setUpdateIds(false); setPlan(null); }} />
            Update {currentSeason} rosters
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "new"} onChange={() => { setMode("new"); setUpdateIds(true); setPlan(null); }} />
            Start a new season (archives {currentSeason})
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={updateIds} onChange={(e) => { setUpdateIds(e.target.checked); setPlan(null); }} />
          Update Riot IDs from the sheet
          <span className="text-xs text-zinc-500">(leave off for an older sheet, so renames since then aren&apos;t undone)</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="text-sm"
            onChange={(e) => {
              setPlan(null);
              const m = /\[([A-Za-z]{2}\d{2})\]/.exec(e.target.files?.[0]?.name ?? "");
              if (m && mode === "new") setSeasonName(m[1].toUpperCase());
            }}
          />
          {mode === "new" && (
            <input value={seasonName} onChange={(e) => { setSeasonName(e.target.value); setPlan(null); }}
              placeholder="New season, e.g. SP27" className={`${field} w-40`} maxLength={12} />
          )}
          <button disabled={pending} className="btn btn-secondary">{pending && !plan ? "Reading…" : "Preview"}</button>
        </div>
      </form>

      {msg && <p className={`text-sm ${msg.ok ? "text-teal-400" : "text-red-400"}`}>{msg.text}</p>}

      {plan && (
        <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
          <p className="text-sm">
            {plan.mode === "new" ? <>New season <b>{plan.seasonName}</b>: </> : <>Update <b>{plan.seasonName}</b>: </>}
            <b>{plan.counts.teams}</b> teams, <b>{plan.counts.players}</b> players · {plan.counts.newPlayers} new ·{" "}
            {plan.counts.idChanges} Riot ID changes{plan.mode === "update" ? ` · ${plan.counts.moved} moved · ${plan.counts.leaving} leaving` : ""}
          </p>

          {plan.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-300">
              {plan.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}

          <details className="text-sm" open={plan.counts.teams <= 4}>
            <summary className="cursor-pointer text-zinc-400">Teams ({plan.teams.length})</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.teams.map((t) => (
                <span key={t.name} className="rounded border border-zinc-800 px-2 py-1 text-xs">
                  {t.name} <span className="text-zinc-500">· {t.group ?? "no group"} · {t.players}</span>
                  {t.isNew && plan.mode === "update" && <span className="ml-1 text-teal-400">new</span>}
                </span>
              ))}
            </div>
          </details>

          {(() => {
            const notable = plan.rows.filter((r) => !r.playerId || r.changes.length);
            return (
              <details className="text-sm" open>
                <summary className="cursor-pointer text-zinc-400">Changes ({notable.length}); {plan.rows.length - notable.length} players unchanged</summary>
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                  {notable.map((r) => (
                    <li key={r.team + r.riotId} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">{r.riotId}</span>
                      <span className="text-zinc-500">{r.team}</span>
                      {!r.playerId ? <span className="text-teal-400">new player</span> : <span className="text-zinc-300">{r.changes.join(" · ")}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })()}

          {plan.mode === "update" && plan.leaving.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-400">Leaving the roster ({plan.leaving.length})</summary>
              <p className="mt-2 text-zinc-300">{plan.leaving.join(", ")}</p>
            </details>
          )}

          <div className="flex gap-3">
            <button onClick={apply} disabled={pending || blocking.length > 0} className="btn btn-primary">
              {pending ? "Importing…" : plan.mode === "new" ? `Archive ${currentSeason} & start ${plan.seasonName}` : "Import rosters"}
            </button>
            <button onClick={() => setPlan(null)} disabled={pending} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
