"use client";

/** The approval gate and the charge, in that order.
 *
 *  Confirming is what freezes the quote onto the transfer, so the amount that is
 *  charged is read back from the row the server wrote — never from a constant, a
 *  prop, or anything this screen multiplied. When the fee is more than the
 *  delivery reserve the server refuses with `reserve_short` and the difference
 *  comes out of the flexible bucket only if the traveler taps for it
 *  (constitution 1).
 *
 *  `forceFail` used to be a checkbox next to a real Pay button. The decline path
 *  still has to be demonstrable, so it moved to `?outcome=fail` — reachable by
 *  whoever is running the demo, invisible to whoever is paying. */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { warmOfflineRoutes } from "@/app/sw-register";
import { IconAlert, IconArrow, IconRetry } from "@/components/icons";
import type { Remedy } from "@/lib/transfers/eligibility";
import { payMethods, useApp } from "../../app-state";
import { Blocked } from "../../blocked";
import { etaLabel, flexibleRemedyLabel, paymentFailureCopy, price, priceExact } from "../../view";

type PayStatus = "idle" | "confirming" | "processing" | "failed";

function PayScreen() {
  const router = useRouter();
  const forceFail = useSearchParams().get("outcome") === "fail";
  const app = useApp();
  const { trip, transfer, quote, selectedBagCount, bagCount, eligibility, wallet, confirmTransfer, issuePass, refresh, setPaymentRef, notify, currency, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, selectedBagCount || bagCount)); }, [loadDropoffPoints, selectedBagCount, bagCount]);
  /** No default. This screen is an approval gate (constitution 1), and a
   *  pre-selected method turns one tap into consent to something the traveller
   *  never chose — on a phone with no Apple Pay, to a method that does not exist.
   *  The wireframe draws nothing selected; the wireframe is right. */
  const [payMethod, setPayMethod] = useState("");
  const [status, setStatus] = useState<PayStatus>("idle");
  const [failure, setFailure] = useState("");
  const [shortfall, setShortfall] = useState<{ cents: number; coverable: boolean } | null>(null);

  const feeCents = transfer?.confirmedAt ? transfer.feeCents : quote?.feeCents ?? transfer?.feeCents ?? 0;
  const blockCode = eligibility && !eligibility.eligible ? eligibility.code : null;
  // What the flexible bucket is being asked for, in the numbers the traveller can check.
  const shortCents = shortfall?.cents ?? Math.max(0, feeCents - wallet.reserveCents);
  const coverable = shortfall ? shortfall.coverable : wallet.flexibleCents >= shortCents;

  /** One tap, two commitments: the delivery is confirmed, then the card is run.
   *  Both are the traveler's, and neither happens without this button. */
  const pay = async (approveFlexible = false) => {
    if (!transfer || status === "processing" || status === "confirming") return;
    setFailure("");
    if (!transfer.confirmedAt) {
      setStatus("confirming");
      const confirmed = await confirmTransfer(transfer.id, approveFlexible);
      if (!confirmed.ok) {
        setStatus("idle");
        if (confirmed.data.code === "reserve_short") setShortfall({ cents: Number(confirmed.data.shortfallCents ?? 0), coverable: Boolean(confirmed.data.coverable) });
        return;
      }
    }
    setStatus("processing");
    await refresh();
    try {
      // The amount is not sent. The server charges the fee frozen onto the
      // transfer when it was confirmed, so this screen cannot pay its own number.
      const response = await fetch("/api/payments/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transferId: transfer.id, method: payMethod, outcome: forceFail ? "fail" : "succeed", clientOpId: transfer.id }) });
      const data = (await response.json()) as { status?: string; failureCode?: string; paymentReference?: string; error?: string };
      if (data.status !== "captured") { setStatus("failed"); setFailure(data.failureCode ?? (data.error === "payment_unavailable" ? "processing_error" : data.error ?? "processing_error")); return; }
      setPaymentRef(data.paymentReference ?? ""); setStatus("idle"); notify("Delivery paid · simulated");
      await refresh();                                       // the `paid` event is what moves the status
      // Issue the drop-off pass here, while there is still signal. The counter is
      // underground; a pass that has to be fetched there is a pass that does not exist.
      void issuePass(transfer.id);
      warmOfflineRoutes(["/bags/drop"]);           // the counter is underground; this is the last place with signal
      router.push("/bags/drop");
    } catch { setStatus("failed"); setFailure("processing_error"); }
  };

  const remedy = (action: Remedy) => {
    if (action === "approve_flexible") return void pay(true);
    if (action === "confirm_hotel" || action === "use_other_address") return router.push("/trips");
    router.push("/bags/review");
  };

  if (!transfer) return <div className="screen pay-screen"><Header title="Pay for delivery" back={() => router.push("/bags/select")} /><h1>No delivery to pay for.</h1><p className="alert-copy">Choose your bags and a drop-off counter first.</p><button className="back-to-chat" onClick={() => router.push("/bags/select")}>Choose bags</button></div>;

  return <div className="screen pay-screen"><Header title={status === "failed" ? "Payment failed" : "Pay for delivery"} back={() => router.push("/bags/review")} action={<span className="draft-badge">SIMULATED</span>} />
    {status === "failed" ? <>
      <section className="pay-failed" role="alert"><i><IconAlert /></i><b>Payment didn’t go through</b><h1 className="visually-hidden">Payment failed</h1><small>{paymentFailureCopy[failure] ?? paymentFailureCopy.processing_error} Your card wasn’t charged, and your bags are still on the delivery.</small></section>
      <button className="main-button" onClick={() => { setStatus("idle"); setFailure(""); }}><span>Try again<small>Nothing has been charged</small></span><i><IconRetry /></i></button>
      <button className="back-to-chat" onClick={() => { setStatus("idle"); setFailure(""); setPayMethod(""); router.replace("/bags/pay"); }}>Use another payment method</button>
      <button className="refund-button" onClick={() => { setStatus("idle"); setFailure(""); router.push("/bags/review"); }}>Back to the delivery</button>
    </> : <>
      <div className="pay-amount"><small>SAME-DAY DELIVERY · {selectedBagCount || bagCount} {(selectedBagCount || bagCount) === 1 ? "BAG" : "BAGS"}</small><b>{priceExact(feeCents, transfer.currency || currency)}</b><h1 className="visually-hidden">Pay for hotel delivery</h1><em>{transfer.dropoffStore?.name ?? "Drop-off counter"} → {trip.hotelName || "your hotel"}</em><em>{etaLabel(transfer.etaStart, transfer.etaEnd)}</em></div>
      {blockCode && <Blocked code={blockCode} detail={eligibility?.detail} remedies={eligibility?.remedies} onRemedy={remedy}
        labels={blockCode === "reserve_short" ? { approve_flexible: flexibleRemedyLabel(shortCents, wallet.flexibleCents, currency) } : undefined}
        blocked={blockCode === "reserve_short" && !coverable ? ["approve_flexible"] : undefined}
        note={blockCode === "reserve_short" ? `Your delivery reserve holds ${price(wallet.reserveCents, currency)} and this fee is ${price(feeCents, transfer.currency || currency)}. Flexible money only moves when you tap for it.` : undefined} />}
      <section className="pay-methods" role="radiogroup" aria-labelledby="pay-with"><header><small id="pay-with">PAY WITH</small></header>{payMethods.map((method) => <label key={method.id} className={payMethod === method.id ? "on" : ""}><input type="radio" name="pay-method" checked={payMethod === method.id} onChange={() => setPayMethod(method.id)} /><i aria-hidden="true">{method.mark}</i><span><b>{method.label}</b><small>{method.detail}</small></span></label>)}</section>
      {forceFail && <div className="ownership-note">Decline path armed by <code>?outcome=fail</code>. Remove it from the URL to charge normally.</div>}
      <div className="ownership-note">No money moves. Trail simulates the card charge; the amount is the fee frozen onto your delivery when you confirm it.</div>
      {/* A disabled button that will not say why is its own failure. The reason is
          inside the button, where the tap that did not work happened. */}
      <button className="main-button dark" disabled={status !== "idle" || !payMethod || (Boolean(blockCode) && blockCode !== "reserve_short")} onClick={() => void pay()}><span>{status === "confirming" ? "Confirming the delivery…" : status === "processing" ? "Contacting the card…" : `Pay ${priceExact(feeCents, transfer.currency || currency)}`}<small>{!payMethod ? "Choose a payment method first" : transfer.confirmedAt ? `Confirmed for ${priceExact(transfer.feeCents, transfer.currency || currency)}` : "Confirms the delivery, then charges the fee"}</small></span><i><IconArrow /></i></button>
    </>}
  </div>;
}

export default function PayPage() { return <Suspense fallback={<div className="screen pay-screen"><h1>Pay for delivery</h1></div>}><PayScreen /></Suspense>; }
