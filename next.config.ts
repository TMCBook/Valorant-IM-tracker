import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Agent portraits and rank badges are 256–1024px originals; Next.js
    // resizes them to the size actually shown (24–56px) and caches the result.
    remotePatterns: [{ protocol: "https", hostname: "media.valorant-api.com" }],
  },
};

export default nextConfig;
