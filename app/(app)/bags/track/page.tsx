"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconBag, IconCheck, IconChilled } from "@/components/icons";
import { DELIVERY_FEE, useApp } from "../../app-state";
import { continueHref } from "../../landing";

const steps = ["Sealed", "Collected", "On route", "At hotel"];

export default function TrackPage() {
  const router = useRouter();
  const app = useApp();
  const { trip, purchases, selectedBags, bought, bagCount, selectedBagCount, deliveryStep, setDeliveryStep, setTransferStatus, paymentRef, notify } = app;
  const delivered = deliveryStep === 3;

  return <div className="screen tracking-screen"><Header action={<button className="text-action light" onClick={() => router.push("/trail")}>Done</button>} />
    {bagCount === 0 ? <section className="bags-empty"><i><IconBag /></i><p>HANDS-FREE WHEN YOU NEED IT</p><h1>No purchased bags yet.</h1><span>Visit a recommended store and save an in-store purchase. Then Trail can carry the sealed bag to {trip.hotel}.</span><button onClick={() => router.push(continueHref(app))}>Go to my shopping route</button></section> : <>
      <div className="simulation-badge">PROTOTYPE TRANSFER SIMULATION</div>
      <div className="free-hands"><div><IconCheck /></div><p>{delivered ? "SAMPLE HOTEL RECEIPT" : "PURCHASED BAGS ON THE MOVE"}</p><h1>{delivered ? "Waiting safely at the hotel." : "Your hands are free."}</h1><span>{delivered ? `The sample front desk at ${trip.hotel} checked every seal.` : "Keep exploring. This prototype lets you preview the transfer states."}</span></div>
      <div className="tracking-card"><div><span>TR–2718 · {selectedBagCount || bagCount} purchased {(selectedBagCount || bagCount) === 1 ? "bag" : "bags"}</span><b>{deliveryStep === 1 ? "Partner handoff" : deliveryStep === 2 ? "On the way" : delivered ? "Hotel received" : "Sealed"}</b></div>
        <section>{steps.map((label, index) => <span className={index <= deliveryStep ? "done" : ""} key={label}><i>{index < deliveryStep ? <IconCheck /> : null}</i><small>{label}</small></span>)}</section>
        <footer><span>{delivered ? "Sample hotel receipt" : "Sample ETA"}</span><b>{delivered ? "Front desk · 6:42 PM" : "6:30–7:00 PM"}</b></footer>
        {paymentRef && <div className="tracking-payment"><span>Payment</span><b>{paymentRef} · CAD ${DELIVERY_FEE} paid</b></div>}
        {!delivered && <button onClick={() => { const next = Math.min(3, deliveryStep + 1); setDeliveryStep(next); if (next === 3) { setTransferStatus("completed"); notify("Sample hotel receipt created"); } }}>Preview next status</button>}
        {delivered && <button onClick={() => notify("Hotel receipt saved with bag IDs and seal status")}>Save hotel receipt</button>}
      </div>
      {bought.some((stop) => selectedBags[stop.id] && purchases[stop.id].handling === "Chilled") && <div className="cold-chain"><i><IconChilled /></i><span><b>Chilled handling simulated</b><small>Sample ice-pack window remains safe through handoff</small></span></div>}
    </>}
  </div>;
}
