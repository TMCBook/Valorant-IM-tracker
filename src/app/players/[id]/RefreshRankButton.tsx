"use client";

import { useTransition } from "react";
import { refreshRankAction } from "@/app/actions";

export default function RefreshRankButton({ playerId }: { playerId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="underline hover:text-white disabled:opacity-50"
      onClick={() =>
        start(async () => {
          const r = await refreshRankAction(playerId);
          if (!r.ok) alert(r.error);
        })
      }
    >
      {pending ? "Refreshing…" : "Refresh rank"}
    </button>
  );
}
