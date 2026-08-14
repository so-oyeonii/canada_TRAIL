"use client";

/** `forceFail` used to be a checkbox on this screen, next to a real Pay button.
 *  The decline path still has to be demonstrable, so it moved to `?outcome=fail`
 *  — reachable by whoever is running the demo, invisible to whoever is paying. */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Header } from "@/components/chrome";
import { IconAlert, IconArrow, IconRetry } from "@/components/icons";
import { DELIVERY_FEE, failureCopy, payMethods, useApp } from "../../app-state";

type PayStatus = "idle" | "processing" | "failed";

function PayScreen() {
  const router = useRouter();
  const forceFail = useSearchParams().get("outcome") === "fail";
  const { trip, bagCount, selectedBagCount, setTransferStatus, setDeliveryStep, setPaymentRef, notify } = useApp();
  const [payMethod, setPayMethod] = useState("apple");
  const [status, setStatus] = useState<PayStatus>("idle");
  const [failure, setFailure] = useState("");

  const pay = async () => {
    if (status === "processing") return;
    setStatus("processing"); setFailure("");
    try {
      const response = await fetch("/api/payments/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountCents: DELIVERY_FEE * 100, method: payMethod, outcome: forceFail ? "fail" : "succeed" }) });
      const data = (await response.json()) as { status?: string; failureCode?: string; paymentReference?: string };
      if (data.status !== "captured") { setStatus("failed"); setFailure(data.failureCode ?? "processing_error"); return; }
      setPaymentRef(data.paymentReference ?? ""); setStatus("idle"); setTransferStatus("active"); setDeliveryStep(1); router.push("/bags/track"); notify("Delivery paid · simulated");
    } catch { setStatus("failed"); setFailure("processing_error"); }
  };

  return <div className="screen pay-screen"><Header title={status === "failed" ? "Payment failed" : "Pay for delivery"} back={() => router.push("/bags/review")} action={<span className="draft-badge">SIMULATED</span>} />
    {status === "failed" ? <>
      <section className="pay-failed"><i><IconAlert /></i><b>Payment didn’t go through</b><h1 className="visually-hidden">Payment failed</h1><small>{failureCopy[failure] ?? failureCopy.processing_error} Your card wasn’t charged, and the CAD ${DELIVERY_FEE} delivery reserve is still protected.</small></section>
      <button className="main-button" onClick={() => { setStatus("idle"); setFailure(""); }}><span>Try again<small>Nothing has been charged</small></span><i><IconRetry /></i></button>
      <button className="back-to-chat" onClick={() => { setStatus("idle"); setFailure(""); router.replace("/bags/pay"); }}>Use a different payment method</button>
      <button className="refund-button" onClick={() => { setStatus("idle"); setFailure(""); router.push("/bags/review"); notify("Delivery cancelled · reserve released"); }}>Cancel this delivery</button>
    </> : <>
      <div className="pay-amount"><small>HOTEL BAG DELIVERY</small><b>CAD ${DELIVERY_FEE}.00</b><h1 className="visually-hidden">Pay for hotel bag delivery</h1><em>{selectedBagCount || bagCount} {(selectedBagCount || bagCount) === 1 ? "bag" : "bags"} · {trip.hotel || "your hotel"} · sample ETA 6:30–7:00 PM</em></div>
      <section className="pay-methods"><header><small>PAY WITH</small></header>{payMethods.map((method) => <label key={method.id} className={payMethod === method.id ? "on" : ""}><input type="radio" name="pay-method" checked={payMethod === method.id} onChange={() => setPayMethod(method.id)} /><i>{method.mark}</i><span><b>{method.label}</b><small>{method.detail}</small></span></label>)}</section>
      {forceFail && <div className="ownership-note">Decline path armed by <code>?outcome=fail</code>. Remove it from the URL to charge normally.</div>}
      <div className="ownership-note">No money moves. Trail is simulating the card charge so the delivery flow can be tested end to end.</div>
      <button className="main-button dark" disabled={status === "processing"} onClick={pay}><span>{status === "processing" ? "Contacting the card…" : `Pay CAD $${DELIVERY_FEE}.00`}<small>{status === "processing" ? "This takes a moment" : "Reserved amount is charged now"}</small></span><i><IconArrow /></i></button>
    </>}
  </div>;
}

export default function PayPage() { return <Suspense fallback={<div className="screen pay-screen"><h1>Pay for delivery</h1></div>}><PayScreen /></Suspense>; }
