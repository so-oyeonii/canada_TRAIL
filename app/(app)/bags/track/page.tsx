"use client";

/** Custody, as the ledger tells it.
 *
 *  `deliveryStep` used to be client state a button incremented, which is exactly
 *  how the screen could claim a handoff that never happened. The four labels are
 *  derived from `transfer_events` now, and the only rows this screen can write
 *  are the traveler's own claims: dropped off, delayed, seal issue, cancelled. */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/chrome";
import { IconBag, IconCheck, IconChilled } from "@/components/icons";
import { DELIVERY_STEPS } from "@/lib/state/selectors";
import { useApp } from "../../app-state";
import { Blocked, HandoffFailed } from "../../blocked";
import { clockTime, etaLabel, money, price, sourceChip } from "../../view";

const STATUS_COPY: Record<string, string> = { draft: "Not confirmed", awaiting_payment: "Confirmed · waiting for payment", paid: "Paid · take the bags to the counter", dropped_off: "With the partner", in_transit: "On the way to your hotel", delivered: "Delivered to your hotel", failed: "The hotel did not take them", cancelled: "Cancelled" };

export default function TrackPage() {
  const router = useRouter();
  const app = useApp();
  const { trip, transfer, deliveryStep, selectedBagCount, bagCount, paymentRef, reportEvent, reportIssue, advanceSimulation, notify, currency } = app;
  const [busy, setBusy] = useState("");
  const delivered = transfer?.status === "delivered";
  const failedHandoff = transfer?.handoffFailureCode ?? (transfer?.status === "failed" ? "front_desk_refused" : null);

  const claim = async (type: "dropped_off" | "cancelled") => { if (!transfer) return; setBusy(type); const reply = await reportEvent(transfer.id, type); setBusy(""); notify(reply.ok ? (type === "cancelled" ? "Delivery cancelled" : "Drop-off recorded") : "Trail refused that update"); };
  const simulate = async (fail?: "tag_mismatch" | "front_desk_refused") => { if (!transfer) return; setBusy("sim"); const reply = await advanceSimulation(transfer.id, fail); setBusy(""); if (reply.status === 404) notify("The delivery simulator is switched off on this server"); };

  if (!transfer) return <div className="screen tracking-screen"><Header action={<button className="text-action light" onClick={() => router.push("/trail")}>Done</button>} />
    <section className="bags-empty"><i><IconBag /></i><p>HANDS-FREE WHEN YOU NEED IT</p><h1>No bags on the move.</h1><span>Visit a stop, save what you bought, and Trail can carry the sealed bags to {trip.hotelName || "your hotel"}.</span><button onClick={() => router.push(bagCount ? "/bags/select" : "/trail/shop")}>{bagCount ? "Choose bags to send" : "Go to my shopping route"}</button></section>
  </div>;

  return <div className="screen tracking-screen"><Header action={<button className="text-action light" onClick={() => router.push("/trail")}>Done</button>} />
    {sourceChip(transfer.source) && <div className="simulation-badge">{sourceChip(transfer.source)} TRANSFER</div>}
    <div className="free-hands"><div><IconCheck /></div><p>{delivered ? "HOTEL RECEIPT" : "PURCHASED BAGS"}</p><h1>{delivered ? "Waiting safely at the hotel." : failedHandoff ? "Your bags are still with Trail." : "Your hands are free."}</h1><span>{delivered ? `The front desk at ${transfer.hotelName} checked every seal.` : STATUS_COPY[transfer.status] ?? transfer.status}</span></div>

    {failedHandoff && <HandoffFailed code={failedHandoff} onReport={() => { void reportIssue(transfer.id, "wrong_hotel", "The hotel did not accept the delivery."); notify("Reported. Trail keeps the bags sealed."); }} onAddress={() => router.push("/trips")} />}
    {transfer.ineligibleCode && !transfer.confirmedAt && <Blocked code={transfer.ineligibleCode} detail={transfer.ineligibleReason ?? undefined} onRemedy={() => router.push("/bags/review")} />}

    <div className="tracking-card"><div><span>{transfer.referenceCode} · {selectedBagCount || transfer.bagCount || bagCount} purchased {(selectedBagCount || transfer.bagCount || bagCount) === 1 ? "bag" : "bags"}</span><b>{STATUS_COPY[transfer.status] ?? transfer.status}</b></div>
      <section>{DELIVERY_STEPS.map((label, index) => <span className={index <= deliveryStep ? "done" : ""} key={label}><i>{index < deliveryStep ? <IconCheck /> : null}</i><small>{label}</small></span>)}</section>
      <footer><span>{delivered ? "Received" : "ETA"}</span><b>{delivered ? `${transfer.receipt?.receivedBy ?? "Front desk"} · ${clockTime(transfer.deliveredAt)}` : etaLabel(transfer.etaStart, transfer.etaEnd)}</b></footer>
      {transfer.dropoffStore && !delivered && <div className="tracking-payment"><span>Drop-off</span><b>{transfer.dropoffStore.name} · {transfer.dropoffStore.address}</b></div>}
      {(transfer.confirmedAt || paymentRef) && <div className="tracking-payment"><span>Fee</span><b>{price(transfer.feeCents, transfer.currency || currency)}{paymentRef ? ` · ${paymentRef}` : " · not charged yet"}</b></div>}
      {transfer.receipt && <div className="tracking-payment"><span>Receipt</span><b>{transfer.receipt.bagCount} bag{transfer.receipt.bagCount === 1 ? "" : "s"} · seals {transfer.receipt.sealIds.length ? transfer.receipt.sealIds.join(", ") : "not recorded"}</b></div>}
      {["awaiting_payment", "paid"].includes(transfer.status) && <button disabled={Boolean(busy)} onClick={() => void claim("dropped_off")}>{busy === "dropped_off" ? "Recording…" : "I handed the bags over"}</button>}
      {transfer.source === "simulated" && !delivered && transfer.status !== "cancelled" && <button disabled={Boolean(busy)} onClick={() => void simulate()}>{busy === "sim" ? "Advancing…" : "Advance the simulation"}</button>}
      {transfer.source === "simulated" && transfer.status === "in_transit" && <button disabled={Boolean(busy)} onClick={() => void simulate("front_desk_refused")}>Simulate a refused handoff</button>}
      {["draft", "awaiting_payment", "paid"].includes(transfer.status) && <button disabled={Boolean(busy)} onClick={() => void claim("cancelled")}>Cancel this delivery</button>}
    </div>

    {transfer.items.some((item) => item.handling === "Chilled") && <div className="cold-chain"><i><IconChilled /></i><span><b>Chilled handling</b><small>Four hours from the till. Trail checks it again at the counter.</small></span></div>}
    {transfer.issues.length > 0 && <div className="offline-note"><b>{transfer.issues.length} report{transfer.issues.length === 1 ? "" : "s"} open.</b><span>{transfer.issues[0].description || transfer.issues[0].kind} · {transfer.issues[0].status}</span></div>}
    {delivered && transfer.receipt && <div className="offline-note"><b>Receipt saved.</b><span>{money(transfer.receipt.purchasesCents)} {currency} of purchases · {money(transfer.receipt.transferFeeCents)} {currency} delivery.</span></div>}
  </div>;
}
