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
import { IconAlert, IconArrow, IconRetry } from "@/components/icons";
import type { Remedy } from "@/lib/transfers/eligibility";
import { payMethods, useApp } from "../../app-state";
import { Blocked } from "../../blocked";
import { etaLabel, money, paymentFailureCopy, price } from "../../view";

type PayStatus = "idle" | "confirming" | "processing" | "failed";

function PayScreen() {
  const router = useRouter();
  const forceFail = useSearchParams().get("outcome") === "fail";
  const app = useApp();
  const { trip, transfer, quote, selectedBagCount, bagCount, eligibility, confirmTransfer, refresh, setPaymentRef, notify, currency, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, selectedBagCount || bagCount)); }, [loadDropoffPoints, selectedBagCount, bagCount]);
  const [payMethod, setPayMethod] = useState("apple");
  const [status, setStatus] = useState<PayStatus>("idle");
  const [failure, setFailure] = useState("");
  const [shortfall, setShortfall] = useState<{ cents: number; coverable: boolean } | null>(null);

  const feeCents = transfer?.confirmedAt ? transfer.feeCents : quote?.feeCents ?? transfer?.feeCents ?? 0;
  const blockCode = eligibility && !eligibility.eligible ? eligibility.code : null;

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
    const snapshot = await refresh();
    const charge = snapshot.state?.transfer?.feeCents ?? feeCents;
    try {
      const response = await fetch("/api/payments/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountCents: charge, method: payMethod, outcome: forceFail ? "fail" : "succeed" }) });
      const data = (await response.json()) as { status?: string; failureCode?: string; paymentReference?: string };
      if (data.status !== "captured") { setStatus("failed"); setFailure(data.failureCode ?? "processing_error"); return; }
      setPaymentRef(data.paymentReference ?? ""); setStatus("idle"); notify("Delivery paid · simulated");
      router.push("/bags/track");
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
      <button className="back-to-chat" onClick={() => { setStatus("idle"); setFailure(""); router.replace("/bags/pay"); }}>Use a different payment method</button>
      <button className="refund-button" onClick={() => { setStatus("idle"); setFailure(""); router.push("/bags/review"); }}>Back to the delivery</button>
    </> : <>
      <div className="pay-amount"><small>HOTEL BAG DELIVERY</small><b>{price(feeCents, transfer.currency || currency)}</b><h1 className="visually-hidden">Pay for hotel bag delivery</h1><em>{selectedBagCount || bagCount} {(selectedBagCount || bagCount) === 1 ? "bag" : "bags"} · {trip.hotelName || "your hotel"} · {etaLabel(transfer.etaStart, transfer.etaEnd)}</em></div>
      {blockCode && <Blocked code={blockCode} detail={eligibility?.detail} remedies={eligibility?.remedies} onRemedy={remedy} note={shortfall ? `${price(shortfall.cents, transfer.currency || currency)} short. ${shortfall.coverable ? "Your flexible budget can cover it." : "Your flexible budget cannot cover it either."}` : undefined} />}
      <section className="pay-methods"><header><small>PAY WITH</small></header>{payMethods.map((method) => <label key={method.id} className={payMethod === method.id ? "on" : ""}><input type="radio" name="pay-method" checked={payMethod === method.id} onChange={() => setPayMethod(method.id)} /><i>{method.mark}</i><span><b>{method.label}</b><small>{method.detail}</small></span></label>)}</section>
      {forceFail && <div className="ownership-note">Decline path armed by <code>?outcome=fail</code>. Remove it from the URL to charge normally.</div>}
      <div className="ownership-note">No money moves. Trail simulates the card charge; the amount is the fee frozen onto your delivery when you confirm it.</div>
      <button className="main-button dark" disabled={status !== "idle" || (Boolean(blockCode) && blockCode !== "reserve_short")} onClick={() => void pay()}><span>{status === "confirming" ? "Confirming the delivery…" : status === "processing" ? "Contacting the card…" : `Approve and pay ${price(feeCents, transfer.currency || currency)}`}<small>{transfer.confirmedAt ? `Confirmed for ${money(transfer.feeCents)} ${transfer.currency}` : "Confirms the delivery, then charges the fee"}</small></span><i><IconArrow /></i></button>
    </>}
  </div>;
}

export default function PayPage() { return <Suspense fallback={<div className="screen pay-screen"><h1>Pay for delivery</h1></div>}><PayScreen /></Suspense>; }
