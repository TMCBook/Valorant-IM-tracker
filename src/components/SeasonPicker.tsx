"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setSeasonAction } from "@/app/actions";

/** Top-bar season switcher. The choice is saved in a cookie so every page follows it. */
export default function SeasonPicker({ seasons, selected }: { seasons: { name: string; is_current: boolean }[]; selected: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (seasons.length < 2) return <span className="rounded border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{selected}</span>;
  return (
    <select
      aria-label="Season"
      value={selected}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await setSeasonAction(e.target.value);
          router.refresh();
        })
      }
      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
    >
      {seasons.map((s) => (
        <option key={s.name} value={s.name}>
          {s.name}{s.is_current ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}
