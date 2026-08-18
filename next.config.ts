import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    /** The service worker keys its caches on this, so a deploy replaces them instead
     *  of serving yesterday's shell. Vercel supplies the commit; a local build gets
     *  "dev" and reuses one cache, which is what you want while iterating. */
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  },
  /** `/s/*` is a share link: a public URL, with a token in its path, showing someone's
   *  gift list. Three headers, each closing a different leak.
   *
   *  `no-store` so a revoke takes effect on the next request rather than whenever a CDN
   *  or a phone browser feels like revalidating. `X-Robots-Tag` as well as the page's own
   *  `robots` metadata and `/robots.txt`, because a crawler that ignores one still has to
   *  be told by the response itself. `no-referrer` because the token is in the path, and
   *  any outbound link on that page would otherwise hand the whole working URL to a third
   *  party in a `Referer` header. */
  async headers() {
    return [{ source: "/s/:path*", headers: [
      { key: "Cache-Control", value: "no-store, private" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }];
  },
};

export default nextConfig;
