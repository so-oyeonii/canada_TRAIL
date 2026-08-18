"use client";

/** The purchase sheet, promoted from a modal to a full screen with its own URL.
 *
 *  The draft is written to `localStorage` under the stop id on every keystroke and
 *  only cleared on an explicit save or cancel. A traveler is standing at a till
 *  when they type this; if the tab is evicted the number they already entered has
 *  to still be there when they come back.
 *
 *  Saving queues `PUT /api/purchases/{stopId}` — a whole-record replacement, so a
 *  replay from the outbox leaves the same row — and shows the new total straight
 *  away. If the write is still queued, the shop list says so rather than implying
 *  Trail has it. */

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { IconCheck, IconClose } from "@/components/icons";
import type { Handling } from "@/lib/state/types";
import { useApp, type PurchaseDraft } from "../../../../app-state";
import { fromMinor, minorUnits, toMinor } from "@/lib/money/format";
import { price } from "../../../../view";

const draftKey = (stopId: string) => `trail:draft:record:${stopId}`;
const HANDLINGS: Handling[] = ["Standard", "Heavy", "Fragile", "Chilled"];

export default function RecordPurchasePage() {
  const router = useRouter();
  const { stopId } = useParams<{ stopId: string }>();
  const { stops, wallet, currency, savePurchase, removePurchase, notify, queued } = useApp();
  const stop = stops.find((entry) => entry.id === stopId) ?? null;
  const existing = stop?.purchase && !stop.purchase.voidedAt ? stop.purchase : null;
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Read once, after hydration, for the stop this URL names. `localStorage` is not
  // available on the server, and re-running when the purchase changes would
  // overwrite what is being typed at the till.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!stop) return;
      let restored: PurchaseDraft | null = null;
      try { const raw = localStorage.getItem(draftKey(stopId)); if (raw) restored = JSON.parse(raw) as PurchaseDraft; } catch { /* unreadable draft: fall back to the saved purchase */ }
      setDraft(restored ?? (existing ? { actualPriceCents: existing.actualPriceCents, quantity: existing.quantity, bags: existing.bags, handling: existing.handling } : { actualPriceCents: stop.snapshotPriceCents, quantity: 1, bags: 1, handling: stop.handling }));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId]);

  const edit = (patch: Partial<PurchaseDraft>) => setDraft((current) => { if (!current) return current; const next = { ...current, ...patch }; try { localStorage.setItem(draftKey(stopId), JSON.stringify(next)); } catch { /* quota */ } return next; });
  const clearDraft = () => { try { localStorage.removeItem(draftKey(stopId)); } catch { /* quota */ } };
  const cancel = () => { clearDraft(); router.push("/trail/shop"); };

  const confirm = async () => {
    if (!draft || saving) return;
    if (!Number.isFinite(draft.actualPriceCents) || draft.actualPriceCents <= 0 || draft.quantity < 1 || draft.bags < 1) { setError("Enter a positive total, quantity and bag count."); return; }
    setSaving(true);
    const reply = await savePurchase(stopId, { ...draft, actualPriceCents: Math.round(draft.actualPriceCents) });
    setSaving(false);
    if (!reply.ok) { setError(reply.status === 409 ? "This purchase was already saved from another device. Trail kept that one." : "Trail refused this purchase. Check the amount and try again."); return; }
    clearDraft();
    notify(queued > 0 ? "Purchase saved on this phone · syncing" : "Purchase saved");
    router.push("/trail/shop");
  };

  if (!stop) return <div className="screen record-screen"><Header title="Record a purchase" back={() => router.push("/trail/shop")} /><h1>That stop is not on your route.</h1><p className="alert-copy">It may have been replaced by another stop.</p><button className="back-to-chat" onClick={() => router.push("/trail/shop")}>Back to today’s route</button></div>;
  if (!draft) return <div className="screen record-screen"><Header title="Record a purchase" back={cancel} /><h1>{stop.storeName}</h1><p>Opening this purchase…</p></div>;

  const after = wallet.spendableCents + (existing?.actualPriceCents ?? 0) - draft.actualPriceCents;
  // The till shows whole units of the trip's currency. Yen has no cents, so neither has the step.
  const units = minorUnits(currency), step = units === 1 ? "1" : "0.01";

  return <div className="screen record-screen"><Header title="Record a purchase" back={cancel} action={<button className="round-button" onClick={cancel} aria-label="Cancel purchase record"><IconClose /></button>} />
    <section className="purchase-sheet"><header><span><small>{existing ? "EDIT PURCHASE" : "BOUGHT IN STORE"}</small><b>{stop.storeName}</b></span></header>
      <h1 className="visually-hidden">Record a purchase at {stop.storeName}</h1>
      <label>Total paid, tax included<input type="number" min={step} step={step} inputMode={units === 1 ? "numeric" : "decimal"} value={fromMinor(draft.actualPriceCents, currency)} onChange={(e) => edit({ actualPriceCents: toMinor(Number(e.target.value), currency) })} /></label>
      <div className="sheet-pair"><label>Quantity<input type="number" min="1" inputMode="numeric" value={draft.quantity} onChange={(e) => edit({ quantity: Number(e.target.value) })} /></label><label>Shopping bags<input type="number" min="1" inputMode="numeric" value={draft.bags} onChange={(e) => edit({ bags: Number(e.target.value) })} /></label></div>
      <label>Handling<select value={draft.handling} onChange={(e) => edit({ handling: e.target.value as Handling })}>{HANDLINGS.map((option) => <option key={option}>{option}</option>)}</select></label>
      <div className="sheet-impact"><span>Gift budget after saving</span><b className={after < 0 ? "negative" : ""}>{price(after, currency)}</b></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="main-button" disabled={saving} onClick={() => void confirm()}><span>{saving ? "Saving…" : "Save purchase"}<small>Updates your budget and what can be sent to the hotel</small></span><i><IconCheck /></i></button>
      {existing && <button className="refund-button" onClick={() => { void removePurchase(stopId); clearDraft(); notify("Purchase removed and budget restored"); router.push("/trail/shop"); }}>Remove purchase / refund</button>}
      <button className="back-to-chat" onClick={cancel}>Cancel without saving</button>
    </section>
  </div>;
}
