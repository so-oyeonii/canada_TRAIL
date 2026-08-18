"use client";

/** Custody, as the ledger tells it. Frame `-12`.
 *
 *  `deliveryStep` used to be client state a button incremented, which is exactly
 *  how the screen could claim a handoff that never happened. The rows come from
 *  `timelineRows()` now: ordered by the server's `seq`, timed by `occurredAt`,
 *  and with a fifth row for the failure the four success labels have no room for.
 *
 *  The only rows this screen can write are the traveller's own claims — dropped
 *  off, delayed, seal issue, cancelled. Collection, transit and the hotel handoff
 *  are somebody else's claim and RLS refuses them here.
 *
 *  `Delivery complete →` is a link to `/bags/done` that appears only once the
 *  ledger says `delivered` (§1-6). It does not advance anything. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/chrome";
import { IconAlert, IconArrow, IconBag, IconCheck, IconChilled, IconClock, IconQr } from "@/components/icons";
import { timelineRows } from "@/lib/state/selectors";
import { useTrip } from "../../app-state";
import { Blocked, HandoffFailed } from "../../blocked";
import { clockTime, etaLabel, price, priceExact, sourceChip } from "../../view";

/** `Confirmed · waiting for payment` said two things and only one of them was true:
 *  nothing is confirmed until it is paid for. The rest are FIGMA_ADOPTION §2's status
 *  names. `paid` keeps its sentence because it is the one status that is an instruction. */
const STATUS_COPY: Record<string, string> = { draft: "Not confirmed", awaiting_payment: "Waiting for payment", paid: "Paid · take the bags to the counter", dropped_off: "Dropped off", in_transit: "On the way to hotel", delivered: "Delivered", failed: "The hotel did not take them", cancelled: "Cancelled" };
const STATE_WORD: Record<string, string> = { done: "Done", current: "Happening now", future: "Not yet", warning: "Reported", failed: "Stopped here" };

export default function TrackPage() {
  const router = useRouter();
  const app = useTrip();
  const { trip, transfer: live, lastDelivered, selectedBagCount, bagCount, paymentRef, reportEvent, reportIssue, advanceSimulation, notify, currency } = app;
  // A delivered run is closed, so `transfer` is null by then. Tracking is still where
  // its receipt lives, so the finished one is read back rather than shown as "no bags".
  const transfer = live ?? lastDelivered;
  const [busy, setBusy] = useState("");
  const delivered = transfer?.status === "delivered";
  const failedHandoff = transfer?.handoffFailureCode ?? (transfer?.status === "failed" ? "front_desk_refused" : null);

  const claim = async (type: "dropped_off" | "cancelled" | "delayed" | "seal_issue") => { if (!live) return; setBusy(type); const reply = await reportEvent(live.id, type); setBusy(""); notify(reply.ok ? { cancelled: "Delivery cancelled", dropped_off: "Drop-off recorded", delayed: "Delay reported", seal_issue: "Seal problem reported" }[type] : "Trail refused that update"); };
  const simulate = async (fail?: "tag_mismatch" | "front_desk_refused") => { if (!live) return; setBusy("sim"); const reply = await advanceSimulation(live.id, fail); setBusy(""); if (reply.status === 404) notify("The delivery simulator is switched off on this server"); };

  if (!transfer) return <div className="screen tracking-screen"><Header title="Bag Tracking" action={<button className="text-action light" onClick={() => router.push("/trail")}>Done</button>} />
    <section className="bags-empty"><i><IconBag /></i><p>HANDS-FREE WHEN YOU NEED IT</p><h1>No bags on the move.</h1><span>Visit a stop, save what you bought, and Trail can carry the sealed bags to {trip.hotelName || "your hotel"}.</span><button onClick={() => router.push(bagCount ? "/bags" : "/trail/shop")}>{bagCount ? "Choose bags to send" : "Go to my shopping route"}</button></section>
  </div>;

  const rows = timelineRows(transfer.events, transfer.handoffFailureCode);
  const bags = selectedBagCount || transfer.bagCount || bagCount;
  const reference = transfer.payment?.reference ?? (paymentRef || null);

  return <div className="screen tracking-screen">
    <Header title="Bag Tracking" subtitle={transfer.referenceCode} action={<button className="text-action light" onClick={() => router.push("/trail")}>Done</button>} />
    {sourceChip(transfer.source) && <div className="simulation-badge">{sourceChip(transfer.source)} TRANSFER</div>}
    <div className="free-hands"><div><IconCheck /></div><p>{delivered ? "HOTEL RECEIPT" : "PURCHASED BAGS"}</p><h1>{delivered ? "Waiting safely at the hotel." : failedHandoff ? "Your bags are still with Trail." : "Your hands are free."}</h1><span>{delivered ? `The front desk at ${transfer.hotelName} checked every seal.` : STATUS_COPY[transfer.status] ?? transfer.status}</span></div>

    {failedHandoff && <HandoffFailed code={failedHandoff} onReport={() => { void reportIssue(transfer.id, "wrong_hotel", "The hotel did not accept the delivery."); notify("Reported. Trail keeps the bags sealed."); }} onAddress={() => router.push("/trips")} />}
    {transfer.ineligibleCode && !transfer.confirmedAt && <Blocked code={transfer.ineligibleCode} detail={transfer.ineligibleReason ?? undefined} onRemedy={() => router.push("/bags/review")} />}

    <h2 className="section-label">CUSTODY</h2>
    <ol className="timeline">{rows.map((row) => <li key={row.key} className={`is-${row.state}`} aria-current={row.state === "current" ? "step" : undefined}>
      <span className="timeline-dot">{row.state === "done" ? <IconCheck /> : row.state === "warning" || row.state === "failed" ? <IconAlert /> : null}</span>
      <b>{row.label}<span className="visually-hidden"> — {STATE_WORD[row.state]}</span></b>
      {row.at ? <time dateTime={row.at}>{clockTime(row.at)}</time> : row.state === "future" ? <time>{transfer.etaEnd && row.label === "Delivered" ? `Est. ${clockTime(transfer.etaEnd)}` : "—"}</time> : null}
    </li>)}</ol>

    <dl className="info-stack">
      <div><dt>Destination</dt><dd>{transfer.hotelName || trip.hotelName}</dd></div>
      <div><dt>Bag count</dt><dd className="num">{bags}</dd></div>
      <div><dt>Tracking ID</dt><dd className="num">{transfer.referenceCode}</dd></div>
      <div><dt>Payment</dt><dd className="num">{transfer.payment?.status === "captured" ? `${priceExact(transfer.payment.amountCents, transfer.payment.currency || currency)}${reference ? ` · ${reference}` : ""}` : transfer.confirmedAt ? `${price(transfer.feeCents, transfer.currency || currency)} · not charged yet` : "Not confirmed"}</dd></div>
      {transfer.dropoffStore && <div><dt>Drop-off partner</dt><dd>{transfer.dropoffStore.name}{sourceChip(transfer.dropoffStore.source) ? <> <span className={`badge badge--${transfer.dropoffStore.source}`}>{sourceChip(transfer.dropoffStore.source)}</span></> : null}</dd></div>}
      {!delivered && <div><dt>Estimated arrival</dt><dd>{etaLabel(transfer.etaStart, transfer.etaEnd)}</dd></div>}
    </dl>

    {/* §1-6: a link to the completion screen, shown only once the ledger says so.
        It never writes an event — the button that used to advance a step is gone. */}
    {delivered && <Link className="btn btn--primary btn--block" href="/bags/done">Delivery complete<IconArrow /></Link>}

    {live && ["awaiting_payment", "paid"].includes(live.status) && <div className="track-actions">
      <Link className="btn btn--primary btn--block" href="/bags/drop">Show my drop-off pass<IconQr /></Link>
      <button className="btn btn--ghost btn--block" disabled={Boolean(busy)} onClick={() => void claim("dropped_off")}>{busy === "dropped_off" ? "Recording…" : "I handed the bags over"}</button>
    </div>}

    {live && !delivered && live.status !== "cancelled" && <div className="track-actions">
      {["dropped_off", "in_transit"].includes(live.status) && <><button className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => void claim("delayed")}>{busy === "delayed" ? "Reporting…" : "Report a delay"}</button>
      <button className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => void claim("seal_issue")}>{busy === "seal_issue" ? "Reporting…" : "Report a broken seal"}</button></>}
      {["draft", "awaiting_payment", "paid"].includes(live.status) && <button className="btn btn--danger" disabled={Boolean(busy)} onClick={() => void claim("cancelled")}>Cancel this delivery</button>}
    </div>}

    {live && live.source === "simulated" && !delivered && live.status !== "cancelled" && <div className="track-actions sim-actions"><span className="badge badge--simulated">SIMULATED</span>
      <button className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => void simulate()}>{busy === "sim" ? "Advancing…" : "Advance the simulation"}</button>
      {live.status === "in_transit" && <><button className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => void simulate("front_desk_refused")}>Simulate a refused handoff</button>
      <button className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => void simulate("tag_mismatch")}>Simulate a tag mismatch</button></>}
    </div>}

    {transfer.items.some((item) => item.handling === "Chilled") && <div className="cold-chain"><i><IconChilled /></i><span><b>Chilled handling</b><small>Four hours from the till. Trail checks it again at the counter.</small></span></div>}
    {transfer.issues.length > 0 && <div className="offline-note"><b>{transfer.issues.length} report{transfer.issues.length === 1 ? "" : "s"} open.</b><span>{transfer.issues[0].description || transfer.issues[0].kind} · {transfer.issues[0].status}</span></div>}
    {transfer.receipt && <div className="offline-note"><b>Receipt saved.</b><span><IconClock /> {clockTime(transfer.receipt.receivedAt)} · {transfer.receipt.receivedBy} · seals {transfer.receipt.sealIds.length ? transfer.receipt.sealIds.join(", ") : "not recorded"}</span><span>{price(transfer.receipt.purchasesCents, currency)} of purchases · {price(transfer.receipt.transferFeeCents, currency)} delivery.</span></div>}
  </div>;
}
