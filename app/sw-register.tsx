"use client";

/** Registers `public/sw.js`, and nothing else.
 *
 *  After load, not during: a service worker that installs while the first screen
 *  is still painting competes with the request for `/api/state`, and this one only
 *  earns its keep on the *next* visit anyway.
 *
 *  `?v=` is the cache generation. `updateViaCache: "none"` keeps the browser from
 *  serving a stale copy of the worker itself, which is how a bad cache rule
 *  outlives the deploy that fixed it. */

import { useEffect } from "react";

export const SW_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/** Ask the worker to keep the counter screen reachable offline. Called from the
 *  payment screen, which is the last place with signal before a basement. */
export function warmOfflineRoutes(urls: string[]) {
  if (typeof navigator === "undefined") return;
  navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage({ type: "warm", urls })).catch(() => {});
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    const register = () => { void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(SW_VERSION)}`, { scope: "/", updateViaCache: "none" }).catch(() => {}); };
    if (document.readyState === "complete") register();
    else { window.addEventListener("load", register); return () => window.removeEventListener("load", register); }
  }, []);
  return null;
}
