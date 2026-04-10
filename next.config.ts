import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack for faster dev builds
  // (enabled via `next dev --turbopack`)

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
    ],
  },

  // Allow subdomain-based multi-tenancy in local dev
  async rewrites() {
    return [];
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },

  // Ignore build-time errors for BullMQ / ioredis (server-only)
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
