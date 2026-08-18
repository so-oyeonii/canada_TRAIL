"use client";

/** The boundary every screen under `(app)` falls into.
 *
 *  Next builds this inside `(app)/layout.tsx`'s children slot, so it renders within
 *  `AppProvider` and inside `AppShell`'s `<main>` — the tab bar is still there, which is
 *  the only navigation left once a screen has stopped drawing.
 *
 *  It does not read `useApp()` even though the context is in scope: if `app-state.tsx` is
 *  what threw, consuming it here kills the boundary with the same exception. Offline comes
 *  off `navigator` directly, after mount, so the server render and the client agree.
 *
 *  It says nothing about what was or was not saved. A render can crash after a POST has
 *  already landed, so "nothing was saved" is a sentence this file cannot prove. */

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => { const read = () => setOffline(navigator.onLine === false); read(); addEventListener("online", read); addEventListener("offline", read); return () => { removeEventListener("online", read); removeEventListener("offline", read); }; }, []);

  return <div className="screen" role="alert">
    <h1 className="drop-head">This screen stopped drawing.</h1>
    <p className="lede">Trail lost its place here. Nothing you recorded was lost, and anything still waiting to save is queued on this phone.</p>
    {offline && <p className="lede">You are offline, so nothing was sent either way.</p>}
    <button className="btn btn--primary btn--block" onClick={reset}>Try this screen again</button>
    <Link className="btn btn--ghost btn--block" href="/home">Go to Home</Link>
    {error.digest && <p className="quiet-note">Error reference {error.digest}</p>}
  </div>;
}
