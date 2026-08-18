"use client";

/** Frame `-13`. The one screen that may say "Delivered."
 *
 *  It says it because `receipts` has a row, which only `handoffTransfer()` writes
 *  and only after `compareSeals()` matched the tag set — not the count. Three bags
 *  where one tag belongs to somebody else is a `tag_mismatch`, not a delivery, and
 *  that is why the tag line here reads `receipt.sealIds.length` and never
 *  `bagCount`.
 *
 *  The guard is the point of the screen. A `failed` handoff reaching a page that
 *  reads "Delivered." is exactly what constitution 4 exists to stop, so anything
 *  that is not a delivered run is sent back to tracking. The delivered transfer is
 *  read from `lastDelivered`, not `transfer`: a delivered run is closed, and this
 *  page has to survive a reload after that.
 *
 *  `Rate Trail` from the frame is not drawn. There is no table to store a rating
 *  in, and a button that silently discards the tap is the worst failure this app
 *  has. Recorded in `docs/FIGMA_ADOPTION.md` §5. */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/chrome";
import { IconArrow, IconCheck, IconReceipt } from "@/components/icons";
import { useTrip } from "../../app-state";
import { clockTime, priceExact, sourceChip } from "../../view";

export default function DeliveryDonePage() {
  const router = useRouter();
  const { trip, lastDelivered, currency, hydrated } = useTrip();
  const receipt = lastDelivered?.receipt ?? null;
  const payment = lastDelivered?.payment ?? null;
  const ok = lastDelivered?.status === "delivered";

  // Not a render-time redirect: a cached read that has not caught up yet would
  // bounce a traveller off their own completion screen.
  useEffect(() => { if (hydrated && !ok) router.replace("/bags/track"); }, [hydrated, ok, router]);

  if (!ok || !lastDelivered) return <div className="screen"><Header title="Delivery" /><h1 className="drop-head">Nothing delivered yet.</h1><p className="lede">Taking you back to tracking.</p></div>;

  const at = clockTime(receipt?.receivedAt ?? lastDelivered.deliveredAt);
  const bags = receipt?.bagCount ?? lastDelivered.bagCount;

  return <div className="screen done-screen">
    <Header title="Hotel Delivery" subtitle={lastDelivered.referenceCode} action={sourceChip(lastDelivered.source) ? <span className={`badge badge--${lastDelivered.source}`}>{sourceChip(lastDelivered.source)}</span> : null} />
    <div className="done-hero"><i><IconCheck /></i><h1>Delivered.<br /><em>Keep exploring.</em></h1><p>Your {bags} {bags === 1 ? "bag" : "bags"} {bags === 1 ? "was" : "were"} delivered to {lastDelivered.hotelName || trip.hotelName} front desk{at ? ` at ${at}` : ""}.</p></div>

    <ul className="done-checks">
      <li><IconCheck /><span><b>Hotel handoff confirmed</b><small>{receipt?.receivedBy ? `Signed by ${receipt.receivedBy}` : "The front desk signed for them"}</small></span></li>
      {receipt && receipt.sealIds.length > 0
        ? <li><IconCheck /><span><b>{receipt.sealIds.length} Trail {receipt.sealIds.length === 1 ? "tag" : "tags"} scanned</b><small>{receipt.sealIds.join(" · ")}</small></span></li>
        : <li className="is-quiet"><IconReceipt /><span><b>No tag list on this receipt</b><small>The handoff was signed for, but the seal tags were not recorded against it.</small></span></li>}
    </ul>

    <dl className="info-stack">
      <div><dt>Destination</dt><dd>{lastDelivered.hotelName || trip.hotelName}</dd></div>
      <div><dt>Bag count</dt><dd className="num">{bags}</dd></div>
      <div><dt>Tracking ID</dt><dd className="num">{lastDelivered.referenceCode}</dd></div>
      <div><dt>Payment</dt><dd className="num">{payment ? `${payment.reference ?? "Reference not recorded"} · ${priceExact(payment.amountCents, payment.currency || currency)}` : "Not charged"}</dd></div>
    </dl>
    {lastDelivered.source === "simulated" && <p className="ownership-note">This delivery and its charge are simulated. No money moved and no bags travelled.</p>}

    <button className="btn btn--ghost btn--block" onClick={() => router.push("/bags/track")}>View receipt<IconReceipt /></button>
    <button className="btn btn--primary btn--block" onClick={() => router.push("/trail")}>Continue exploring {trip.city}<IconArrow /></button>
  </div>;
}
