import Image from "next/image";
import { iconKey, type IconMap } from "@/lib/valorant-assets";

// next/image resizes the large originals from media.valorant-api.com down to
// the size shown here (see images.remotePatterns in next.config.ts).

/** Agent portrait. Shows nothing if the agent is unknown or the icon list didn't load. */
export function AgentIcon({ name, icons, size = 28 }: { name: string | null | undefined; icons: IconMap; size?: number }) {
  const src = icons[iconKey(name)];
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={name ?? ""}
      title={name ?? ""}
      width={size}
      height={size}
      className="shrink-0 rounded bg-zinc-800 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** Agent icon followed by its name, for table cells. */
export function AgentLabel({ name, icons, size = 24 }: { name: string | null | undefined; icons: IconMap; size?: number }) {
  if (!name) return <span className="text-zinc-500">–</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <AgentIcon name={name} icons={icons} size={size} />
      <span>{name}</span>
    </span>
  );
}

/** Small badge + rank name, for tables. "–" when the rank isn't known. */
export function RankLabel({ tier, icons, size = 22 }: { tier: string | null | undefined; icons: IconMap; size?: number }) {
  if (!tier) return <span className="text-zinc-600">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <RankIcon tier={tier} icons={icons} size={size} />
      <span className="text-zinc-300">{tier}</span>
    </span>
  );
}

/** Rank badge (Iron 1 … Radiant). */
export function RankIcon({ tier, icons, size = 56 }: { tier: string | null | undefined; icons: IconMap; size?: number }) {
  const src = icons[iconKey(tier)];
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={tier ?? ""}
      title={tier ?? ""}
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
