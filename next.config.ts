import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/** Names this build, so the service worker (public/sw.js) updates and drops old caches on every deploy */
function buildId() {
  const id = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (id) return id.slice(0, 24);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local";
  } catch {
    return "local";
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: buildId() },
  async headers() {
    return [
      // Always check for a new service worker, so nobody gets stuck on an old build
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      { source: "/sw-push.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;
