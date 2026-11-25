import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Monorepo: Next only auto-loads apps/web/.env*. Also pin the tracing root —
// a parent-folder lockfile otherwise makes Next treat C:\Users\irfan as root.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const { combinedEnv } = nextEnv.loadEnvConfig(repoRoot);

// Prefer file values from combinedEnv (process.env may already hold empty
// strings from a prior bad load, and @next/env will not override those).
for (const key of Object.keys(combinedEnv)) {
  if (!process.env[key]) {
    process.env[key] = combinedEnv[key];
  }
}

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL:
    combinedEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    combinedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  NEXT_PUBLIC_APP_URL:
    combinedEnv.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    combinedEnv.APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@turf/shared-types", "@turf/validation", "@turf/config"],
  env: publicEnv,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  /**
   * Reverse-proxy the NestJS API on the same origin so browser calls are
   * first-party (cookies, no CORS). API_PROXY_TARGET points at the API server;
   * override it per environment. Webhook routes pass through untouched.
   */
  async rewrites() {
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
    return [
      { source: "/api/v1/:path*", destination: `${target}/api/v1/:path*` },
    ];
  },
  /**
   * The workspace packages are authored with NodeNext-style relative imports
   * (`./foo.js` resolving to `foo.ts`). The web tsconfig maps @turf/* to their
   * src for types; webpack needs extensionAlias to resolve the same way.
   */
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};
export default nextConfig;
