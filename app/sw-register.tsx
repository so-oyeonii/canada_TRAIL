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

/** ── N1-2 · LOCAL NOTIFICATIONS, AND WHAT THEY ARE NOT ──────────────────────────────
 *
 *  These are drawn by *this page*, while this page is running. They are not push: there
 *  is no `PushManager` subscription, no VAPID key and no server that could send one — and
 *  that is a data decision rather than a scheduling one. A push has to be sent from our
 *  side, which means our side would have to know when the traveller is near a shop, which
 *  means a location history table and a third-party push service reading the sentence on
 *  its way through. `docs/plans/N1-location-alerts.md` §Q4.
 *
 *  So the honest reach of this helper is small, and the settings screen says so in words:
 *  a notification arrives if the tab is still alive when the alert is decided. iOS freezes
 *  the app the moment it leaves the screen, and no amount of code here changes that.
 *
 *  Three platform facts are handled rather than assumed:
 *  · `window.Notification` is **undefined** in a normal iOS Safari tab (it exists only in
 *    a web app added to the Home Screen), so this feature-detects instead of try/catching.
 *  · Android Chrome **throws** on `new Notification()`. Only `registration.showNotification`
 *    is used, which is also the only form the `notificationclick` handler can reopen.
 *  · `navigator.permissions.query({name:"geolocation"})` is unreliable in Safari and is
 *    not consulted anywhere; `Notification.permission` is the one status that is read. */
export type PermissionState = NotificationPermission | "unsupported";
export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
export const notificationPermission = (): PermissionState => (notificationsSupported() ? Notification.permission : "unsupported");
/** The server has no browser, so it has no permission. A screen rendered without this
 *  answer says "this browser cannot", which is the safe thing to be wrong about. */
export const notificationPermissionOnServer = (): PermissionState => "unsupported";

/** An external store rather than state seeded in an effect: `Notification.permission` is
 *  the browser's value, not React's, and it can change from browser settings with no event
 *  to tell us. Subscribers are woken by the one call that can change it from in here. */
const permissionListeners = new Set<() => void>();
export function subscribeNotificationPermission(listener: () => void) { permissionListeners.add(listener); return () => { permissionListeners.delete(listener); }; }

/** From a tap and nowhere else. A refused prompt is expensive to undo and browsers punish
 *  repeat asking, so this is called by one button on one settings screen. */
export async function askNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  finally { for (const listener of permissionListeners) listener(); }
}

export type LocalNotification = { title: string; body: string; href: string; tag: string };

/** Returns whether anything was shown, so a caller can fall back to the in-app banner
 *  rather than assuming a notification landed. `tag` collapses repeats of the same set of
 *  shops into one entry instead of stacking them. */
export async function showLocalNotification({ title, body, href, tag }: LocalNotification): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, { body, tag, data: { href }, icon: "/logo-mark.png", badge: "/logo-mark.png" });
    return true;
  } catch { return false; }
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
