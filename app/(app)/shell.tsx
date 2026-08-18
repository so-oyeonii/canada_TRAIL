"use client";

/** The app shell that replaced the phone mock-up.
 *
 *  What is gone: `.stage`, `.phone`, `.status-bar`, `.home-indicator`, and the
 *  `aria-live="polite"` that used to wrap the entire screen — every navigation
 *  made a screen reader re-read the whole app. Route changes now move focus to the
 *  new page heading instead, and only the toast is a live region.
 *
 *  Scrolling is the document's, not an inner div's, so the mobile address bar can
 *  collapse and `100dvh` means what it says. `go()` used to smooth-scroll to the
 *  top on every transition, which lost a traveler's place on the route list every
 *  time they checked their bags; tab taps restore the position instead. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { IconAsk, IconBag, IconHome, IconTrips } from "@/components/icons";
import { useApp } from "./app-state";
import { hidesTabBar, isStale, SESSION_NS, tabOf, tabRoot, type TabKey } from "./landing";
import { writeFailureCopy } from "./view";

const tabs: { key: TabKey; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "home", label: "Home", Icon: IconHome },
  { key: "trips", label: "Trips", Icon: IconTrips },
  { key: "ai", label: "AI", Icon: IconAsk },
  { key: "bags", label: "Bags", Icon: IconBag },
];
const scrollKey = (path: string) => `${SESSION_NS}:scroll:${path}`;
const tabKey = (tab: TabKey) => `${SESSION_NS}:tab:${tab}`;
const RESTORE = `${SESSION_NS}:restore`;
const session = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);

/** v1 keys point at `/trail/plan/people` and at a `trail` tab that no longer exists.
 *  Only sessionStorage is swept — `localStorage` holds the offline outbox and the
 *  purchase drafts, and nothing in this app may throw those away. */
function sweepLegacySession() {
  const store = session(); if (!store) return;
  for (const key of Object.keys(store)) if (key.startsWith("trail:") && !key.startsWith(`${SESSION_NS}:`)) store.removeItem(key);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const current = tabOf(pathname);
  const firstRender = useRef(true);
  const mainRef = useRef<HTMLElement>(null);
  const bare = hidesTabBar(pathname);

  useEffect(() => { sweepLegacySession(); }, []);
  // Filtered on the way in as well as on the way out: a payment form that keeps
  // being written to the tab key is one refresh away from being restored.
  useEffect(() => { const store = session(); if (!store) return; const save = () => { store.setItem(scrollKey(pathname), String(Math.round(window.scrollY))); if (current && !isStale(app, pathname)) store.setItem(tabKey(current), pathname); }; save(); window.addEventListener("scroll", save, { passive: true }); return () => { save(); window.removeEventListener("scroll", save); }; }, [app, pathname, current]);
  useLayoutEffect(() => { const store = session(); if (!store) return; if (store.getItem(RESTORE) !== pathname) return; store.removeItem(RESTORE); window.scrollTo(0, Number(store.getItem(scrollKey(pathname)) ?? 0)); }, [pathname]);
  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } const target = mainRef.current?.querySelector<HTMLElement>("h1") ?? mainRef.current; if (!target) return; if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }, [pathname]);

  const openTab = useCallback((tab: TabKey, fallback: string) => {
    const store = session();
    const remembered = store?.getItem(tabKey(tab)) ?? null;
    const target = remembered && remembered !== pathname && !isStale(app, remembered) ? remembered : fallback;
    store?.setItem(RESTORE, target);
    router.push(target);
  }, [app, pathname, router]);

  const destination = (tab: TabKey) => tabRoot(tab, app);
  // A delivery the traveler cannot see from here is the one thing worth a badge.
  const badge = app.transfer?.handoffFailureCode ? "alert" : app.transfer && app.transfer.status !== "draft" ? "motion" : null;
  const tabLabel = (tab: TabKey, label: string) => (tab !== "bags" || !badge ? label : badge === "alert" ? "Bags, needs attention" : "Bags, delivery in progress");

  return <div className="app-shell" data-tabbar={bare ? "off" : "on"}>
    <main className="app-main" id="main" ref={mainRef} tabIndex={-1}>{children}</main>
    {/* Constitution: a write that has not landed says so. Pretending it saved is
        the most dangerous thing this app could do in a shop with no signal. */}
    {(app.queued > 0 || app.offline) && <div className="sync-chip" role="status"><b>{app.queued > 0 ? `${app.queued} change${app.queued === 1 ? "" : "s"} waiting to save` : "Offline"}</b><small>{app.offline ? "No connection. Everything you record is kept on this phone." : "Sending to Trail…"}</small>{app.queued > 0 && <button onClick={() => void app.retrySync()}>Retry now</button>}</div>}
    {app.failure && <div className="sync-chip bad" role="alert"><b>One change was not saved</b><small>{writeFailureCopy[app.failure.error] ?? "Trail refused that change. Nothing else was affected."}</small><button onClick={app.clearFailure} aria-label="Dismiss this message">Dismiss</button></div>}
    {app.toast && <div className="app-toast" role="status">{app.toast}</div>}
    {!bare && <nav className="tab-bar" aria-label="Main">{tabs.map(({ key, label, Icon }) => <Link key={key} href={destination(key)} scroll={false} aria-current={current === key ? "page" : undefined} aria-label={tabLabel(key, label)} className={current === key ? "active" : undefined} onClick={(event) => { event.preventDefault(); openTab(key, destination(key)); }}><Icon /><span>{label}</span>{key === "bags" && badge && <em className="tab-badge" data-kind={badge} aria-hidden="true" />}</Link>)}</nav>}
  </div>;
}
