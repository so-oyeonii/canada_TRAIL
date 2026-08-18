"use client";

/** Frame `-7`: the hands-free entry. It used to be a `redirect()` to the bag
 *  picker, which meant the traveller met the delivery for the first time as a
 *  checkbox list.
 *
 *  Three tiles, and only two of them can be honest today:
 *  - **Bags** is real (`draftItems()` off recorded purchases).
 *  - **Time left** is real. `dropoff_points` resolves each counter's wall-clock
 *    cutoff to an instant in the store's own zone, so `minutesToCutoff` arrives
 *    already correct and no screen parses `18:00` itself.
 *  - **Est. weight** does not exist. `bag_transfer_items.weight_grams` is there and
 *    `weightOf()` sums it, but `purchases` has no weight column and `draftItems()`
 *    sets null, so nothing has ever been weighed. A per-bag guess would not stay on
 *    screen — `saveManifest` sends it and `handling_unsupported` is judged against
 *    `max_weight_grams`, so an invented number would refuse a real delivery or wave
 *    a real overload through. It says where the weighing happens instead. */

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/chrome";
import { IconArrow, IconBag, IconCheck, IconClock } from "@/components/icons";
import { useTrip } from "../app-state";
import { price, sourceChip, weightLabel } from "../view";

const timeLeft = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return { value: "—", note: "Cutoff not published" };
  if (minutes <= 0) return { value: "Closed", note: "Today’s drop-off has passed" };
  if (minutes < 90) return { value: `${minutes} min`, note: "Until today’s cutoff" };
  return { value: `~${Math.round(minutes / 60)} hrs`, note: "Until today’s cutoff" };
};

export default function BagsEntryPage() {
  const router = useRouter();
  const app = useTrip();
  const { trip, items, transfer, bought, bagCount, quote, points, partnerCount, wallet, currency, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, bagCount)); }, [loadDropoffPoints, bagCount]);

  const counter = transfer?.dropoffStore ? points.find((point) => point.id === transfer.dropoffStore!.id) ?? null : points[0] ?? null;
  const cutoff = timeLeft(counter?.minutesToCutoff);
  const grams = items.reduce((sum, item) => sum + (item.weightGrams ?? 0), 0);
  const feeCents = quote?.feeCents ?? null;

  if (!bought.length && !transfer) return <div className="screen"><Header title="Hotel Delivery" back={() => router.push("/trail")} />
    <section className="bags-empty"><i><IconBag /></i><p>HANDS-FREE WHEN YOU NEED IT</p><h1>Nothing to send yet.</h1><span>Save what you buy at a stop and Trail can carry the sealed bags to {trip.hotelName || "your hotel"}.</span><button onClick={() => router.push("/trail/shop")}>Go to my shopping route</button></section>
  </div>;

  return <div className="screen handsfree-screen">
    <Header title="Hotel Delivery" subtitle={trip.city} back={() => router.push("/trail")} action={sourceChip(counter?.source ?? null) ? <span className={`badge badge--${counter?.source}`}>{sourceChip(counter?.source ?? null)}</span> : null} />
    <div className="drop-copy"><p>GO HANDS-FREE</p><h1>Leave the bags.<br /><em>Keep exploring.</em></h1><span>Trail carries the sealed bags you already paid for to {trip.hotelName || "your hotel"}. You approve every bag and the fee before anything moves.</span></div>

    <div className="stat-tiles">
      <div><small>BAGS</small><b className="num">{bagCount}</b><em>{bought.length} stop{bought.length === 1 ? "" : "s"} recorded</em></div>
      <div><small>EST. WEIGHT</small><b className="num">{grams ? weightLabel(grams) : "—"}</b><em>{grams ? "From your manifest" : "Weighed at the counter"}</em></div>
      <div><small>TIME LEFT</small><b className="num">{cutoff.value}</b><em>{cutoff.note}</em></div>
    </div>

    <dl className="info-stack">
      <div><dt>Deliver to</dt><dd>{trip.hotelName || "No hotel on this trip"}{trip.hotelVerifiedAt ? <> <span className="badge badge--done"><IconCheck />HOTEL VERIFIED</span></> : null}</dd></div>
      <div><dt>Drop-off partner</dt><dd>{counter ? <>{counter.name}{sourceChip(counter.source) ? <> <span className={`badge badge--${counter.source}`}>{sourceChip(counter.source)}</span></> : null}</> : partnerCount === 0 ? `No Trail counter in ${trip.city} yet` : "Counters are loading"}</dd></div>
      <div><dt>Delivery cost</dt><dd>{feeCents === null ? "Quoted at the counter" : `${price(feeCents, quote?.currency ?? currency)}${wallet.reserveCents >= feeCents ? " (reserved)" : ""}`}</dd></div>
    </dl>

    {counter && counter.minutesToCutoff !== null && counter.minutesToCutoff <= 0 && <section className="notice notice--warn"><IconClock /><b>Today’s drop-off has closed</b><p>{counter.name} stops taking bags for tonight’s run. Your bags and budget stay recorded, and tomorrow’s run opens in the morning.</p></section>}

    <div className="ownership-note">For items you already bought. TRAIL does not order products from the store, and nothing is charged until you approve the fee.</div>
    <button className="btn btn--primary btn--block" disabled={partnerCount === 0} onClick={() => router.push("/bags/select")}>Review delivery<IconArrow /></button>
    {partnerCount === 0 && <p className="quiet-note" role="status">There is nowhere to hand bags over in {trip.city} yet, so this cannot be started.</p>}
  </div>;
}
