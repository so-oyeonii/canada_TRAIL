"use client";

/** The counter boundary. This is the screen a traveller is looking at while standing in
 *  front of a partner with three bags, so it is the one that must not guess.
 *
 *  It does not redraw the QR. Whether a pass is still valid is an expiry check, and
 *  re-running that check inside the boundary that just failed is not evidence — a code the
 *  counter refuses is worse than no code, because the traveller finds out from a stranger.
 *  The reference is text, and text only.
 *
 *  The transfer id is not reachable here (`useApp()` is off limits: if the state module is
 *  what threw, consuming it kills the boundary too), so the pass is found by scanning
 *  `trail-pass-v1:*` and taking the newest one that has not expired. An older delivery's
 *  reference would be a wrong answer, so an expired or unreadable store falls through to
 *  the second sentence rather than printing something. */

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { PASS_KEY_PREFIX, type CachedPass } from "@/lib/transfers/pass-cache";

/** Returns the code, not the pass: `useSyncExternalStore` compares snapshots with
 *  `Object.is`, and a fresh object every render is an infinite loop. */
function liveReferenceCode(): string {
  let best: CachedPass | null = null;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PASS_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key); if (!raw) continue;
      const pass = JSON.parse(raw) as Partial<CachedPass>;
      if (typeof pass?.referenceCode !== "string" || !pass.referenceCode) continue;
      if (typeof pass.expiresAt !== "string" || Date.parse(pass.expiresAt) <= Date.now()) continue;
      if (!best || Date.parse(pass.issuedAt ?? "") > Date.parse(best.issuedAt)) best = pass as CachedPass;
    }
  } catch { return ""; }
  return best?.referenceCode ?? "";
}

const noStoreChanges = () => () => {};

export default function DropError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const reference = useSyncExternalStore(noStoreChanges, liveReferenceCode, () => "");

  return <div className="screen" role="alert">
    <h1 className="drop-head">The drop-off pass did not draw.</h1>
    <p className="lede">Nothing was handed over. Custody moves when a counter scans a working pass, and that has not happened from this screen.</p>
    <p className="lede">{reference ? <>Reference {reference}. The pass is kept on this phone, so trying again does not need a connection.</> : "Trail cannot read a pass on this phone right now."}</p>
    <button className="btn btn--primary btn--block" onClick={reset}>Try the pass again</button>
    <button className="btn btn--ghost btn--block" onClick={() => router.push("/bags")}>Back to Bags</button>
  </div>;
}
