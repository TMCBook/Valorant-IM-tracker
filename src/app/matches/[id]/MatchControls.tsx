"use client";

import { useTransition } from "react";
import { deleteMatchMap, setMatchResult } from "@/app/actions";

export function DeleteMapButton({ mapId }: { mapId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-xs text-zinc-500 hover:text-red-400"
      onClick={() => {
        if (!confirm("Delete this map and all its stats? You can re-upload it afterwards.")) return;
        start(async () => {
          const r = await deleteMatchMap(mapId);
          if (!r.ok) alert(r.error);
        });
      }}
    >
      {pending ? "Deleting…" : "Delete map"}
    </button>
  );
}

export function CompleteToggle({ matchId, completed }: { matchId: string; completed: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="rounded border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
      onClick={() =>
        start(async () => {
          const r = await setMatchResult(matchId, !completed);
          if (!r.ok) alert(r.error);
        })
      }
    >
      {pending ? "…" : completed ? "Reopen match" : "Mark series complete"}
    </button>
  );
}
