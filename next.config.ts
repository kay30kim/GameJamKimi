import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  redirects() {
    return ["kimitales.vercel.app", "gamejam-kimi.vercel.app"].map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://alicetales.vercel.app/:path*",
      permanent: true,
    }));
  },
};

export default nextConfig;
