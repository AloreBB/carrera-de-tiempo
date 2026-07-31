import type { NextConfig } from "next";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@carrera/shared"],
  // Keep trailing slash on /socket.io/ so Engine.IO handshake works when
  // proxied through Next (production should prefer Traefik → API directly).
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      // Exact handshake path + nested (WebSocket upgrade is still flaky via Next)
      {
        source: "/socket.io",
        destination: `${apiUrl}/socket.io/`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${apiUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
