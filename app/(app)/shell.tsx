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
import { IconAsk, IconBag, IconRoute, IconTrips } from "@/components/icons";
import { useApp } from "./app-state";
import { bagsHref, staleForTab, tabOf, type TabKey } from "./landing";

const tabs: { key: TabKey; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "trips", label: "Trips", Icon: IconTrips },
  { key: "trail", label: "Trail", Icon: IconRoute },
  { key: "ask", label: "Ask AI", Icon: IconAsk },
  { key: "bags", label: "Bags", Icon: IconBag },
];
const scrollKey = (path: string) => `trail:scroll:${path}`;
const tabKey = (tab: TabKey) => `trail:tab:${tab}`;
const RESTORE = "trail:restore";
const session = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);

export function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const current = tabOf(pathname);
  const firstRender = useRef(true);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => { const store = session(); if (!store) return; const save = () => { store.setItem(scrollKey(pathname), String(Math.round(window.scrollY))); if (current) store.setItem(tabKey(current), pathname); }; save(); window.addEventListener("scroll", save, { passive: true }); return () => { save(); window.removeEventListener("scroll", save); }; }, [pathname, current]);
  useLayoutEffect(() => { const store = session(); if (!store) return; if (store.getItem(RESTORE) !== pathname) return; store.removeItem(RESTORE); window.scrollTo(0, Number(store.getItem(scrollKey(pathname)) ?? 0)); }, [pathname]);
  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } const target = mainRef.current?.querySelector<HTMLElement>("h1") ?? mainRef.current; if (!target) return; if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }, [pathname]);

  const openTab = useCallback((tab: TabKey, fallback: string) => {
    const store = session();
    const remembered = store?.getItem(tabKey(tab)) ?? null;
    const stale = staleForTab(app);
    const target = remembered && remembered !== pathname && !stale.includes(remembered) ? remembered : fallback;
    store?.setItem(RESTORE, target);
    router.push(target);
  }, [app, pathname, router]);

  const destination = (tab: TabKey) => (tab === "bags" ? bagsHref(app) : `/${tab === "trail" ? "trail" : tab}`);
  const dark = pathname === "/bags/track";

  return <div className="app-shell" data-theme={dark ? "dark" : undefined}>
    <main className="app-main" id="main" ref={mainRef} tabIndex={-1}>{children}</main>
    {app.toast && <div className="app-toast" role="status">{app.toast}</div>}
    <nav className="tab-bar" aria-label="Main">{tabs.map(({ key, label, Icon }) => <Link key={key} href={destination(key)} scroll={false} aria-current={current === key ? "page" : undefined} className={current === key ? "active" : undefined} onClick={(event) => { event.preventDefault(); openTab(key, destination(key)); }}><Icon /><span>{label}</span></Link>)}</nav>
  </div>;
}
