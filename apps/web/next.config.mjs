/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@turf/shared-types", "@turf/validation", "@turf/config"],
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
