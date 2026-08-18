import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    /** The service worker keys its caches on this, so a deploy replaces them instead
     *  of serving yesterday's shell. Vercel supplies the commit; a local build gets
     *  "dev" and reuses one cache, which is what you want while iterating. */
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  },
};

export default nextConfig;
