"use client";

/** The executing half of the old `drop` screen. `/trail/plan/delivery` reads the
 *  same facts with no gate; everything that commits is here.
 *
 *  Three things are the server's and none of them are computed on this screen:
 *  which counters exist and when they close, what the delivery costs, and whether
 *  it can happen at all. A refusal keeps the bag selection standing — the
 *  traveler changes a counter, not their whole afternoon. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { IconArrow, IconCheck, IconChilled, IconClock, IconFragile, IconHotel, IconPin } from "@/components/icons";
import type { Remedy } from "@/lib/transfers/eligibility";
import { useApp } from "../../app-state";
import { Blocked } from "../../blocked";
import { clockTime, etaLabel, price, sourceChip, weightLabel } from "../../view";

export default function BagReviewPage() {
  const router = useRouter();
  const app = useApp();
  const { trip, transfer, selectedItems, selectedBagCount, quote, points, partnerCount, eligibility, wallet, currency, openTransfer, saveManifest, loadDropoffPoints, notify } = app;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const chosen = transfer?.dropoffStore?.id ?? null;
  const counter = points.find((point) => point.id === chosen) ?? null;
  const grams = selectedItems.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0);
  const feeCents = quote?.feeCents ?? transfer?.feeCents ?? null;
  const blockCode = eligibility && !eligibility.eligible ? eligibility.code : transfer?.ineligibleCode ?? null;

  useEffect(() => { void openTransfer(); }, [openTransfer]);
  useEffect(() => { void loadDropoffPoints(Math.max(1, selectedBagCount)); }, [loadDropoffPoints, selectedBagCount]);

  const pick = async (storeId: string) => { setBusy(storeId); setError(""); const reply = await openTransfer(storeId); setBusy(""); if (!reply.ok) setError("Trail could not hold that counter. Check your connection and try again."); };

  const remedy = (action: Remedy) => {
    if (action === "drop_chilled_items" || action === "split_bags") return router.push("/bags/select");
    if (action === "confirm_hotel" || action === "use_other_address") return router.push("/trips");
    if (action === "approve_flexible") return router.push("/bags/pay");
    if (action === "try_tomorrow") return notify("Counters reopen in the morning. Your bags and budget stay recorded.");
    document.getElementById("dropoff-picker")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const next = async () => {
    if (!transfer) return;
    setBusy("continue"); setError("");
    const reply = await saveManifest(transfer.id);
    setBusy("");
    if (!reply.ok) { setError("Those bags could not be put on the delivery. Nothing was sent."); return; }
    router.push("/bags/pay");
  };

  return <div className="screen drop-screen"><Header title="Review transfer" back={() => router.push("/bags/select")} action={<span className="draft-badge">{sourceChip(transfer?.source ?? null) || "LIVE"}</span>} />
    <div className="drop-copy"><p>BEFORE ANYTHING MOVES</p><h1>Choose a counter.</h1><span>Trail carries sealed bags you already paid for. Pick where you will hand them over, then approve the fee.</span></div>

    {blockCode && <Blocked code={blockCode} detail={eligibility?.detail} remedies={eligibility?.remedies} onRemedy={remedy} />}
    {eligibility && !eligibility.eligible && !blockCode && <p className="quiet-note" role="status">{eligibility.detail}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}

    {/* Frame `-8`. `2 minutes away` is not here on purpose: this app has no
        geolocation path, and `stops.walk_minutes` is a distance along the route,
        not the distance to a counter. What the row does know is its area and
        whether it is open, so that is what it says. */}
    <dl className="info-stack review-stack">
      <div><dt><IconHotel />Deliver to</dt><dd>{trip.hotelName || "No hotel on this trip"}{trip.hotelAddress ? <><br /><small>{trip.hotelAddress}</small></> : null}{trip.hotelVerifiedAt ? <> <span className="badge badge--done"><IconCheck />HOTEL VERIFIED</span></> : <> <span className="badge">NOT VERIFIED YET</span></>}</dd></div>
      <div><dt><IconPin />Drop off at</dt><dd>{counter ? <>{counter.name}{sourceChip(counter.source) ? <> <span className={`badge badge--${counter.source}`}>{sourceChip(counter.source)}</span></> : null}<br /><small>{[counter.area, counter.open ? "Open now" : "Closed now", counter.cutoffAt ? `last drop-off ${clockTime(counter.cutoffAt)}` : ""].filter(Boolean).join(" · ")}</small></> : "Not chosen yet"}</dd></div>
      <div><dt><IconClock />Estimated arrival</dt><dd>{transfer?.confirmedAt ? etaLabel(transfer.etaStart, transfer.etaEnd) : "Quoted at the counter"}</dd></div>
    </dl>
    <div className="stat-tiles">
      <div><small>BAGS</small><b className="num">{selectedBagCount}</b><em>{selectedItems.length} group{selectedItems.length === 1 ? "" : "s"}</em></div>
      <div><small>EST. WEIGHT</small><b className="num">{grams ? weightLabel(grams) : "—"}</b><em>{grams ? "From your manifest" : "Weighed at the counter"}</em></div>
    </div>

    <section className="handling-list" id="dropoff-picker"><header><span><small>DROP-OFF COUNTER</small><b>{partnerCount === 0 ? `No counter in ${trip.city}` : `${points.length} partner counter${points.length === 1 ? "" : "s"}`}</b></span><em>{selectedBagCount} {selectedBagCount === 1 ? "BAG" : "BAGS"}</em></header><div className="dropoff-picker">
      {points.length === 0 && <span><i>·</i><b>Nothing to show</b><small>{partnerCount === 0 ? "Trail has no partner counter in this city yet." : "Counters are loading."}</small></span>}
      {points.map((point) => <label key={point.id} className={chosen === point.id ? "on" : undefined}><input type="radio" name="dropoff" checked={chosen === point.id} disabled={Boolean(busy)} onChange={() => void pick(point.id)} /><span><b>{point.name}</b><small>{point.address} · {point.open ? "Open now" : "Closed now"}{point.cutoffAt ? ` · last drop-off ${clockTime(point.cutoffAt)}` : ""}</small><small>Takes {point.acceptedHandling.join(", ").toLowerCase()}</small></span></label>)}
    </div></section>

    <section className="handling-list"><header><span><small>HANDLING CHECK</small><b>What needs care</b></span><em>{selectedItems.length} bag group{selectedItems.length === 1 ? "" : "s"}</em></header><div>
      {selectedItems.some((item) => item.handling === "Fragile") && <span><i><IconFragile /></i><b>Fragile</b><small>Store packing and a seal photo at the counter</small></span>}
      {selectedItems.some((item) => item.handling === "Chilled") && <span><i><IconChilled /></i><b>Chilled</b><small>Four hours from the till — checked again when you confirm</small></span>}
      <span><i><IconHotel /></i><b>{trip.hotelName || "No hotel on this trip"}</b><small>{trip.hotelAddress || "Add an address in Trips"}</small></span>
    </div></section>

    <div className="drop-pass"><div><span>DELIVERY FEE</span><b>{quote ? price(quote.feeCents, quote.currency) : "Quoted at the counter"}</b></div><small>{quote ? `${quote.includedBags} bag${quote.includedBags === 1 ? "" : "s"} included${quote.extraBags ? ` · ${quote.extraBags} extra` : ""} · held from your delivery reserve` : "Trail prices this from the partner list for your city."}</small></div>
    {feeCents !== null && <p className="reserve-note" role="status">{price(Math.min(wallet.reserveCents, feeCents), currency)} is reserved in your Trail wallet but has not been charged yet.{wallet.reserveCents < feeCents ? ` The fee is ${price(feeCents - wallet.reserveCents, currency)} more than the reserve, and you decide where that comes from.` : ""}</p>}
    <div className="ownership-note">Nothing is charged until you approve the next screen. The fee comes from Trail’s price list for {trip.city} — it is not estimated on this phone.</div>
    <button className="main-button dark" disabled={!transfer || !chosen || selectedBagCount === 0 || Boolean(busy)} onClick={() => void next()}><span>{busy === "continue" ? "Saving the bag list…" : "Review and pay for delivery"}<small>{!chosen ? "Choose a drop-off counter first" : selectedBagCount === 0 ? "Select at least one bag" : "You approve the fee on the next screen"}</small></span><i><IconArrow /></i></button>
  </div>;
}
