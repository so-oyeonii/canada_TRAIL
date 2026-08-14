"use client";

/** The purchase sheet, promoted from a modal to a full screen with its own URL.
 *
 *  The draft is written to `localStorage` under the stop id on every keystroke and
 *  only cleared on an explicit save or cancel. A traveler is standing at a till
 *  when they type this; if the tab is evicted the number they already entered has
 *  to still be there when they come back. */

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { IconCheck, IconClose } from "@/components/icons";
import { useApp, type Handling, type Purchase } from "../../../../app-state";

const draftKey = (stopId: string) => `trail:draft:record:${stopId}`;

export default function RecordPurchasePage() {
  const router = useRouter();
  const { stopId } = useParams<{ stopId: string }>();
  const { stopAt, purchaseAt, activePlan, spent, savePurchase, setPurchase, notify } = useApp();
  const stop = stopAt(stopId);
  const existing = purchaseAt(stopId);
  const [draft, setDraft] = useState<Purchase | null>(null);
  const [error, setError] = useState("");

  // Read once, after hydration, for the stop this URL names. `localStorage` is not
  // available on the server, and re-running when the purchase changes would
  // overwrite what is being typed at the till.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!stop) return;
      let restored: Purchase | null = null;
      try { const raw = localStorage.getItem(draftKey(stopId)); if (raw) restored = JSON.parse(raw) as Purchase; } catch { /* unreadable draft: fall back to the saved purchase */ }
      setDraft(restored ?? (existing ? { ...existing } : { status: "bought", actualPrice: stop.price, quantity: 1, bags: 1, handling: stop.handling }));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId]);

  const edit = (patch: Partial<Purchase>) => setDraft((current) => { if (!current) return current; const next = { ...current, ...patch }; try { localStorage.setItem(draftKey(stopId), JSON.stringify(next)); } catch { /* quota */ } return next; });
  const clearDraft = () => { try { localStorage.removeItem(draftKey(stopId)); } catch { /* quota */ } };
  const cancel = () => { clearDraft(); router.push("/trail/shop"); };
  const confirm = () => {
    if (!draft) return;
    if (!Number.isFinite(draft.actualPrice) || draft.actualPrice <= 0 || draft.quantity < 1 || draft.bags < 1) { setError("Enter a positive total, quantity and bag count."); return; }
    savePurchase(stopId, draft); clearDraft(); notify(`Purchase saved · budget ${activePlan.budget - (spent - (existing?.actualPrice ?? 0) + draft.actualPrice)} CAD`); router.push("/trail/shop");
  };

  if (!stop) return <div className="screen record-screen"><Header title="Record a purchase" back={() => router.push("/trail/shop")} /><h1>That stop is not on your route.</h1><p className="alert-copy">It may have been replaced by a nearby alternative.</p><button className="back-to-chat" onClick={() => router.push("/trail/shop")}>Back to today’s route</button></div>;
  if (!draft) return <div className="screen record-screen"><Header title="Record a purchase" back={cancel} /><h1>{stop.store}</h1><p>Opening this purchase…</p></div>;

  const after = activePlan.budget - (spent - (existing?.actualPrice ?? 0) + draft.actualPrice);

  return <div className="screen record-screen"><Header title="Record a purchase" back={cancel} action={<button className="round-button" onClick={cancel} aria-label="Cancel purchase record"><IconClose /></button>} />
    <section className="purchase-sheet"><header><span><small>{existing?.status === "bought" ? "EDIT PURCHASE" : "BOUGHT IN STORE"}</small><b>{stop.store}</b></span></header>
      <h1 className="visually-hidden">Record a purchase at {stop.store}</h1>
      <label>Total paid, tax included<input type="number" min="0.01" step="0.01" value={draft.actualPrice} onChange={(e) => edit({ actualPrice: Number(e.target.value) })} /></label>
      <div className="sheet-pair"><label>Quantity<input type="number" min="1" value={draft.quantity} onChange={(e) => edit({ quantity: Number(e.target.value) })} /></label><label>Shopping bags<input type="number" min="1" value={draft.bags} onChange={(e) => edit({ bags: Number(e.target.value) })} /></label></div>
      <label>Handling<select value={draft.handling} onChange={(e) => edit({ handling: e.target.value as Handling })}><option>Standard</option><option>Heavy</option><option>Fragile</option><option>Chilled</option></select></label>
      <div className="sheet-impact"><span>Gift budget after saving</span><b className={after < 0 ? "negative" : ""}>CAD {after}</b></div>
      {error && <p className="form-error">{error}</p>}
      <button className="main-button" onClick={confirm}><span>Save purchase<small>Update budget and bag transfer options</small></span><i><IconCheck /></i></button>
      {existing?.status === "bought" && <button className="refund-button" onClick={() => { setPurchase(stopId, { status: "planned" }); clearDraft(); notify("Purchase removed and budget restored"); router.push("/trail/shop"); }}>Remove purchase / refund</button>}
      <button className="back-to-chat" onClick={cancel}>Cancel without saving</button>
    </section>
  </div>;
}
