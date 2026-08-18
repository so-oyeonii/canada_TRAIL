"use client";

/** The Delivery lens. Frame `-20`.
 *
 *  The reading half of what used to be one screen: nothing here commits anything,
 *  so the lens can be opened at any point in the trip without a way to start a
 *  transfer by accident. Every approval gate is on `/bags/review`.
 *
 *  What was wrong with it: it printed a partner name and a fee with no label at
 *  all, while `points` and `quote` were both `sample`. Constitution 3 is per row,
 *  so the chip is attached to the counter's own `source` — not to the section, and
 *  not to the transfer's. A live counter inside a simulated delivery is still live.
 *
 *  There are no bag photographs in this app and none in the 25 frames, so the bag
 *  block is what the manifest actually knows: how many, and what needs care. */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconBag, IconCard, IconChilled, IconClock, IconFragile, IconHotel, IconPin } from "@/components/icons";
import { useApp } from "../../../app-state";
import { bagsHref } from "../../../landing";
import { etaLabel, price, sourceChip, weightLabel } from "../../../view";

export default function DeliveryLens() {
  const router = useRouter();
  const app = useApp();
  const { trip, items, transfer, bought, bagCount, quote, pricingSource, points, partnerCount, wallet, currency, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, bagCount)); }, [loadDropoffPoints, bagCount]);

  // The counter the traveller chose, or the first one Trail can offer. Both carry
  // their own `source`; neither is presented as the other.
  const chosen = transfer?.dropoffStore ?? null;
  const suggested = chosen ? null : points[0] ?? null;
  const counter = chosen ?? suggested;
  const counterSource = counter?.source ?? null;
  const feeCents = transfer?.confirmedAt ? transfer.feeCents : quote?.feeCents ?? null;
  const feeCurrency = quote?.currency ?? transfer?.currency ?? currency;
  // Constitution 5: the reserve is a different number from the fee. It only says
  // "reserved" when the reserve actually covers it — short is a real branch.
  const reserved = feeCents !== null && wallet.reserveCents >= feeCents;
  const handlings = new Set(items.map((item) => item.handling));
  const grams = items.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0);

  return <>
    <div className="result-title"><p>HOTEL DELIVERY</p><h1>What can be sent ahead.</h1><span>Read from the purchases you recorded and Trail&rsquo;s partner list. Nothing is booked from this view.</span></div>

    <dl className="info-stack delivery-stack">
      <div><dt><IconHotel />Deliver to</dt><dd>{trip.hotelName || "No hotel on this trip"}{trip.hotelVerifiedAt ? <> <span className="badge badge--done">HOTEL VERIFIED</span></> : <> <span className="badge">NOT VERIFIED YET</span></>}</dd></div>
      <div><dt><IconPin />Drop-off partner</dt><dd>{counter ? <>{counter.name}{sourceChip(counterSource) ? <> <span className={`badge badge--${counterSource}`}>{sourceChip(counterSource)}</span></> : null}{suggested ? <><br /><small>Nearest partner counter · not chosen yet</small></> : null}</> : partnerCount === 0 ? `No Trail counter in ${trip.city} yet` : "Counters are loading"}</dd></div>
      <div><dt><IconClock />Estimated arrival</dt><dd>{transfer?.confirmedAt ? etaLabel(transfer.etaStart, transfer.etaEnd) : "Quoted at the counter"}</dd></div>
      <div><dt><IconCard />Delivery cost</dt><dd>{feeCents === null ? "Quoted at the counter" : <>{price(feeCents, feeCurrency)}{reserved ? " (reserved)" : ""}{pricingSource === "fallback" ? <> <span className="badge badge--sample">SAMPLE PRICE</span></> : null}</>}</dd></div>
    </dl>
    {feeCents !== null && !reserved && <p className="quiet-note" role="status">Your delivery reserve holds {price(wallet.reserveCents, currency)}. That is {price(feeCents - wallet.reserveCents, currency)} short of this fee — you approve where the difference comes from before anything is charged.</p>}

    <section className="bag-summary"><h2 className="section-label">BAGS ON THIS DELIVERY</h2>
      <ul className="bag-chips">
        <li><IconBag />{bagCount} {bagCount === 1 ? "bag" : "bags"} from {bought.length} stop{bought.length === 1 ? "" : "s"}</li>
        {handlings.has("Fragile") && <li><IconFragile />Fragile · packed and sealed at the counter</li>}
        {handlings.has("Chilled") && <li><IconChilled />Chilled · four hours from the till</li>}
        <li>{weightLabel(grams || null)}</li>
      </ul>
    </section>

    {partnerCount === 0 && <div className="budget-warning" role="status"><b>No Trail counter in {trip.city} yet</b><span>You can still record what you buy. Sending bags ahead is not available in this city.</span></div>}
    <div className="ownership-note">For items you already bought. TRAIL does not order products from the store. The fee is quoted by Trail from the partner price list for this city.</div>
    <button className="btn btn--primary btn--block" onClick={() => router.push(bagsHref(app))}>{bought.length ? "Arrange delivery" : "Record a purchase first"}<IconBag /></button>
  </>;
}
