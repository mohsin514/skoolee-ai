import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // An isolated build directory lets synthetic-data acceptance tests run beside the developer's app.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  // The loopback-IP acceptance audit loads the dev server at http://127.0.0.1:<port>.
  // Next 16 blocks dev-only assets/endpoints from origins other than the hostname the
  // server was initialized with (localhost), which prevents hydration and leaves
  // client-rendered forms inert. Allow the loopback IP explicitly (dev-only).
  allowedDevOrigins: ["127.0.0.1"],
  // Enable Turbopack for faster dev builds
  // (enabled via `next dev --turbopack`)
  turbopack: {
    root: process.cwd(),
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },

  // Allow subdomain-based multi-tenancy in local dev
  async rewrites() {
    return [];
  },

  // Security headers
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://api.dicebear.com https://*.amazonaws.com https://*.r2.cloudflarestorage.com https://img.clerk.com",
          "font-src 'self' data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
          "media-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      },
    ];
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/ai/:path*",
        // Recording still requires an explicit browser permission and user action.
        headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(), geolocation=()" }],
      },
      {
        source: "/ai/exams/:id",
        headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), display-capture=(self), geolocation=()" }],
      },
      {
        source: "/api/school-ai/workspace/:id/print",
        // Configured headers run after route headers in this Next version.
        // Keep candidate documents isolated from the app's script policy.
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), display-capture=()" },
        ],
      },
      {
        source: "/api/school-ai/sources/:id/file",
        headers: [
          { key: "Content-Security-Policy", value: "sandbox; default-src 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // Configured headers override route headers: retain the private-file sandbox.
      ...["/api/chat/attachments/:id", "/api/students/documents", "/api/staff/documents", "/api/students/enrollments", "/api/uploads/file"].map(source => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: "sandbox; default-src 'none'; frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      })),
    ];
  },

  // Ignore build-time errors for BullMQ / ioredis (server-only)
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
