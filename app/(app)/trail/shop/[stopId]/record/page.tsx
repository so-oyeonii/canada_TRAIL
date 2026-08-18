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
import { IconAlert, IconCheck, IconClose } from "@/components/icons";
import type { Handling } from "@/lib/state/types";
import { useTrip, type PurchaseDraft } from "../../../../app-state";
import { fromMinor, minorUnits, toMinor } from "@/lib/money/format";
import { budgetScale } from "@/app/trail-brief";
import { flexibleRemedyLabel, price } from "../../../../view";

const draftKey = (stopId: string) => `trail:draft:record:${stopId}`;
const HANDLINGS: Handling[] = ["Standard", "Heavy", "Fragile", "Chilled"];

export default function RecordPurchasePage() {
  const router = useRouter();
  const { stopId } = useParams<{ stopId: string }>();
  const { stops, wallet, currency, savePurchase, removePurchase, notify, queued, proposeBudgetChange, decideBudgetChange } = useTrip();
  const stop = stops.find((entry) => entry.id === stopId) ?? null;
  const existing = stop?.purchase && !stop.purchase.voidedAt ? stop.purchase : null;
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  /** Frame -5. Set when Confirm would take the traveller past their planned bucket, and
   *  the screen becomes the Budget Update instead of saving behind their back. */
  const [overBy, setOverBy] = useState<number | null>(null);

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

  const store = async () => {
    if (!draft) return false;
    setSaving(true);
    const reply = await savePurchase(stopId, { ...draft, actualPriceCents: Math.round(draft.actualPriceCents) });
    setSaving(false);
    if (!reply.ok) { setError(reply.status === 409 ? "This purchase was already saved from another device. Trail kept that one." : "Trail refused this purchase. Check the amount and try again."); return false; }
    clearDraft();
    notify(queued > 0 ? "Purchase saved on this phone · syncing" : "Purchase saved");
    router.push("/trail/shop");
    return true;
  };

  const confirm = async () => {
    if (!draft || saving) return;
    if (!Number.isFinite(draft.actualPriceCents) || draft.actualPriceCents <= 0 || draft.quantity < 1 || draft.bags < 1) { setError("Enter a positive total, quantity and bag count."); return; }
    // Constitution 5: the shopping bucket is `planned − spent`, and flexible money does not
    // move without a tap. Going past it is not refused — the purchase already happened —
    // but it is not waved through either.
    const short = wallet.spendableCents + (existing?.actualPriceCents ?? 0) - draft.actualPriceCents;
    if (short < 0) { setError(""); setOverBy(Math.round(-short)); return; }
    await store();
  };

  /** The one tap that moves money, with the amount, the bucket it leaves and what is left
   *  after it written on the button. Proposing and approving are two requests because 0013
   *  makes them two rows; if the approval half fails the proposal is still waiting on the
   *  approval screen, so nothing is lost and nothing was applied. */
  const drawFromFlexible = async () => {
    if (overBy === null || saving) return;
    setSaving(true); setError("");
    const proposal = await proposeBudgetChange({ kind: "bucket_move", reason: `Purchase at ${stop?.storeName ?? "the store"} went over the shopping budget`, plan: { plannedCents: wallet.plannedCents + overBy, flexibleCents: wallet.flexibleCents - overBy } });
    const changeId = proposal.ok ? String((proposal.data as { budgetChangeId?: string }).budgetChangeId ?? "") : "";
    if (!proposal.ok || !changeId) { setSaving(false); setError("Trail could not move that money. Nothing was changed and the purchase is not saved."); return; }
    const decided = await decideBudgetChange(changeId, "approve");
    setSaving(false);
    if (!decided.ok) { setError("Trail recorded the request but could not apply it. Open Approvals to finish it — your budget has not changed."); return; }
    setOverBy(null);
    await store();
  };

  if (!stop) return <div className="screen record-screen"><Header title="Record Purchase" back={() => router.push("/trail/shop")} /><h1>That stop is not on your route.</h1><p className="alert-copy">It may have been replaced by another stop.</p><button className="back-to-chat" onClick={() => router.push("/trail/shop")}>Back to today’s route</button></div>;
  if (!draft) return <div className="screen record-screen"><Header title="Record Purchase" back={cancel} /><h1>{stop.storeName}</h1><p>Opening this purchase…</p></div>;

  if (overBy !== null) {
    const coverable = wallet.flexibleCents >= overBy;
    return <div className="screen record-screen"><Header title="Budget Update" back={() => setOverBy(null)} />
      <section className="purchase-sheet"><header><span><small>OVER YOUR PLANNED SHOPPING</small><b>{stop.storeName}</b></span></header>
        <h1>This is {price(overBy, currency)} more than your shopping budget holds.</h1>
        <div className="sheet-impact plain"><span>Planned shopping left</span><b>{price(wallet.spendableCents + (existing?.actualPriceCents ?? 0), currency)}</b></div>
        <div className="sheet-impact plain"><span>This purchase</span><b>{price(draft.actualPriceCents, currency)}</b></div>
        <div className="sheet-impact plain"><span>Flexible budget</span><b>{price(wallet.flexibleCents, currency)}</b></div>
        <p className="ownership-note">Nothing has moved. Your delivery reserve is not touched either way — it is what pays to get these bags to the hotel.</p>
        {error && <p className="form-error" role="alert"><IconAlert /> {error}</p>}
        {/* The label carries the amount, the bucket it comes out of and the balance left,
            because a tap on a vaguer button is not an approval of a number nobody saw. */}
        <button className="main-button dark" disabled={saving || !coverable} onClick={() => void drawFromFlexible()}><span>{saving ? "Recording your approval…" : flexibleRemedyLabel(overBy, wallet.flexibleCents, currency)}<small>{coverable ? "Moves it out of flexible and saves the purchase" : "Flexible does not hold enough for this"}</small></span><i><IconCheck /></i></button>
        <button className="back-to-chat" disabled={saving} onClick={() => void store()}>Record it and stay over plan</button>
        <button className="back-to-chat" disabled={saving} onClick={() => setOverBy(null)}>Change the amount</button>
      </section>
    </div>;
  }

  const after = wallet.spendableCents + (existing?.actualPriceCents ?? 0) - draft.actualPriceCents;
  // The till shows whole units of the trip's currency. Yen has no cents, so neither has the step.
  const units = minorUnits(currency), step = units === 1 ? "1" : "0.01";
  // Frame -4's quick amounts. Arithmetic on the price Trail already had, never a
  // suggested price: the planned figure and the next round notes above it, so a till
  // total of $23.40 is two taps rather than six. `budgetScale` keeps ¥5 out of it.
  const note = 5 * budgetScale(currency) * units;
  const quick = [...new Set([stop.snapshotPriceCents, ...[1, 2, 3].map((n) => Math.ceil(stop.snapshotPriceCents / note + n - 1) * note)])].filter((cents) => cents > 0).sort((a, b) => a - b).slice(0, 4);

  return <div className="screen record-screen"><Header title="Record Purchase" back={cancel} action={<button className="round-button" onClick={cancel} aria-label="Cancel purchase record"><IconClose /></button>} />
    <section className="purchase-sheet"><header><span><small>{existing ? "EDIT PURCHASE" : "BOUGHT IN STORE"}</small><b>{stop.storeName}</b></span></header>
      <h1>How much did you actually pay?</h1>
      <div className="sheet-impact plain"><span>Planned amount</span><b>{price(stop.snapshotPriceCents, currency)}</b></div>
      <label>Actual price paid<input type="number" min={step} step={step} inputMode={units === 1 ? "numeric" : "decimal"} value={fromMinor(draft.actualPriceCents, currency)} onChange={(e) => edit({ actualPriceCents: toMinor(Number(e.target.value), currency) })} /></label>
      <fieldset className="quick-amounts"><legend>Quick amounts</legend>{quick.map((cents) => <button type="button" key={cents} aria-pressed={draft.actualPriceCents === cents} onClick={() => edit({ actualPriceCents: cents })}>{price(cents, currency)}</button>)}</fieldset>
      <div className="sheet-pair"><label>Quantity<input type="number" min="1" inputMode="numeric" value={draft.quantity} onChange={(e) => edit({ quantity: Number(e.target.value) })} /></label><label>Shopping bags<input type="number" min="1" inputMode="numeric" value={draft.bags} onChange={(e) => edit({ bags: Number(e.target.value) })} /></label></div>
      <label>Handling<select value={draft.handling} onChange={(e) => edit({ handling: e.target.value as Handling })}>{HANDLINGS.map((option) => <option key={option}>{option}</option>)}</select></label>
      <div className="sheet-impact"><span>Available for shopping after saving</span><b className={after < 0 ? "negative" : ""}>{price(after, currency)}</b></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="main-button" disabled={saving} onClick={() => void confirm()}><span>{saving ? "Saving…" : "Confirm purchase"}<small>Updates your budget and what can be sent to the hotel</small></span><i><IconCheck /></i></button>
      {existing && <button className="refund-button" onClick={() => { void removePurchase(stopId); clearDraft(); notify("Purchase removed and budget restored"); router.push("/trail/shop"); }}>Remove purchase / refund</button>}
      <button className="back-to-chat" onClick={cancel}>Cancel without saving</button>
    </section>
  </div>;
}
