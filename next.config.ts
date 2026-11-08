import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Static security headers. The Content-Security-Policy is set per request in
// src/proxy.ts because it carries a nonce.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  // A separate build folder lets end-to-end tests run beside a normal dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  // Only the landing page uses next/image (hero photo); serve modern formats.
  images: { formats: ["image/avif", "image/webp"] },
  // Demo recordings (scripts/landing-media.ts) start the dev server with this set, so the
  // dev-mode badge stays out of the footage. Unset, nothing changes.
  ...(process.env.NEXT_HIDE_DEV_INDICATOR ? { devIndicators: false as const } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
