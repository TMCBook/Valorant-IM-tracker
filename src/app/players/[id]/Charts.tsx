"use client";

// Two small charts for the player page, drawn as plain SVG/HTML:
//   KdTrend      K/D on each IM map, oldest → newest, with a 1.0 reference line
//   MapWinRates  win rate on each map, as horizontal bars
// Colors validated against the page's dark surface (dataviz palette, dark slot 1).

import { useEffect, useRef, useState } from "react";

const SERIES = "#3987e5";   // chart blue
const SURFACE = "#111113";  // card background, used for the ring around markers
const GRID = "#27272a";
const MUTED = "#71717a";

export type GamePoint = {
  date: string; map: string; opponent: string; agent: string | null;
  kills: number; deaths: number; assists: number; won: boolean; score: string;
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const kdOf = (p: GamePoint) => p.kills / Math.max(1, p.deaths);

export function KdTrend({ games }: { games: GamePoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 200, padL = 36, padR = 44, padT = 14, padB = 28;
  const plotW = width - padL - padR, plotH = H - padT - padB;
  const values = games.map(kdOf);
  const top = Math.max(2, Math.ceil(Math.max(...values) * 2) / 2); // round up to the next 0.5
  const ticks = Array.from({ length: Math.round(top / 0.5) + 1 }, (_, i) => i * 0.5).filter((t) => t === 0 || t % 1 === 0 || top <= 2);
  const x = (i: number) => padL + (games.length === 1 ? plotW / 2 : (i / (games.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + padL;
    let best = 0;
    values.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  }

  const h = hover != null ? games[hover] : null;
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={`K/D per map over ${games.length} maps`}>
        {/* grid + y axis labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={MUTED}>{t.toFixed(t % 1 ? 1 : 0)}</text>
          </g>
        ))}
        {/* 1.0 K/D reference */}
        <line x1={padL} x2={width - padR} y1={y(1)} y2={y(1)} stroke={MUTED} strokeWidth={1} strokeDasharray="4 4" />
        {/* crosshair */}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke={MUTED} strokeWidth={1} />}
        {/* series */}
        <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5.5 : 4} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
        ))}
        {/* direct label on the latest map only */}
        <text x={x(last) + 8} y={y(values[last]) - 8} fontSize={12} fontWeight={600} fill="#e4e4e7">{values[last].toFixed(2)}</text>
        {/* x axis: first and latest date */}
        <text x={x(0)} y={H - 8} fontSize={11} fill={MUTED} textAnchor={games.length === 1 ? "middle" : "start"}>{games[0].date}</text>
        {games.length > 1 && <text x={x(last)} y={H - 8} fontSize={11} fill={MUTED} textAnchor="end">{games[last].date}</text>}
        {/* hit area bigger than the marks */}
        <rect x={padL} y={0} width={plotW} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute z-10 w-48 rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 96, 0), width - 192), top: Math.max(y(values[hover]) - 96, 0) }}
        >
          <div className="font-semibold text-zinc-100">{h.map} vs {h.opponent}</div>
          <div className="text-zinc-400">{h.date} · <span className={h.won ? "text-teal-400" : "text-red-400"}>{h.won ? "W" : "L"} {h.score}</span></div>
          <div className="mt-1 tabular-nums text-zinc-200">
            K/D <b>{kdOf(h).toFixed(2)}</b> · {h.kills}/{h.deaths}/{h.assists}
          </div>
          {h.agent && <div className="text-zinc-400">{h.agent}</div>}
        </div>
      )}
    </div>
  );
}

export type MapRate = { map: string; maps: number; wins: number; kills: number; deaths: number };

export function MapWinRates({ rows }: { rows: MapRate[] }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ul className="space-y-2" aria-label="Win rate by map">
      {rows.map((r) => {
        const pct = Math.round((100 * r.wins) / r.maps);
        return (
          <li
            key={r.map}
            className="relative grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm"
            onMouseEnter={() => setHover(r.map)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="truncate text-zinc-300">{r.map}</span>
            <div className="h-3.5 rounded bg-zinc-800/70">
              <div
                className="h-full rounded transition-[width]"
                style={{ width: `${pct}%`, background: SERIES, opacity: hover && hover !== r.map ? 0.55 : 1 }}
              />
            </div>
            <span className="tabular-nums text-zinc-300">
              <b className="text-zinc-100">{pct}%</b> <span className="text-zinc-500">{r.wins}–{r.maps - r.wins}</span>
            </span>
            {hover === r.map && (
              <div className="pointer-events-none absolute -top-9 left-24 z-10 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                {r.map}: {r.wins}–{r.maps - r.wins} in {r.maps} {r.maps === 1 ? "map" : "maps"} · K/D {(r.kills / Math.max(1, r.deaths)).toFixed(2)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
