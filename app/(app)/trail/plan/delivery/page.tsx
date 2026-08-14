"use client";

import { useRouter } from "next/navigation";
import { IconBag, IconChilled, IconFragile, IconHotel } from "@/components/icons";
import { useApp } from "../../../app-state";
import { bagsHref } from "../../../landing";

/** The reading half of what used to be one screen. Nothing here commits anything —
 *  every approval gate lives on `/bags/review`, so this lens can be opened at any
 *  point in the trip without a way to start a transfer by accident. */
export default function DeliveryLens() {
  const router = useRouter();
  const app = useApp();
  const { trip, plan, stops, bought, bagCount } = app;
  const handlings = new Set(stops.map((stop) => stop.handling));

  return <>
    <div className="result-title"><p>HOTEL BAG TRANSFER</p><h1>What can be sent ahead.</h1><span>Handling is read from each purchase you record. Nothing is booked from this view.</span></div>
    <section className="handling-list"><header><span><small>SAMPLE TRANSFER CHECK</small><b>Handling on this route</b></span><em>{plan.hotelDelivery ? "REQUESTED" : "OFF"}</em></header><div>
      {handlings.has("Fragile") && <span><i><IconFragile /></i><b>Fragile</b><small>Store packing and seal photo required</small></span>}
      {handlings.has("Chilled") && <span><i><IconChilled /></i><b>Chilled</b><small>Sample ice-pack window until 7:30 PM</small></span>}
      <span><i><IconBag /></i><b>Standard</b><small>Sealed bags carried as bought</small></span>
      <span><i><IconHotel /></i><b>Hotel</b><small>{trip.hotel ? `${trip.hotel} · sample front desk acceptance` : "Add a hotel in Trips before requesting transfer"}</small></span>
    </div></section>
    <div className="plan-impact"><div><i><IconBag /></i><span><small>PURCHASED BAGS</small><b>{bagCount} bag{bagCount === 1 ? "" : "s"} from {bought.length} stop{bought.length === 1 ? "" : "s"}</b></span></div><div><i><IconHotel /></i><span><small>ESTIMATED FEE</small><b>CAD $9 · simulated</b></span></div></div>
    <div className="ownership-note">For items you already bought. TRAIL does not order products from the store. Partner, price and ETA are prototype simulations.</div>
    <button className="main-button dark" onClick={() => router.push(bagsHref(app))}><span>{bought.length ? "Choose bags and send them" : "Record a purchase first"}<small>{bought.length ? "You approve every bag before anything moves" : "Transfer starts from a purchase you saved in store"}</small></span><i><IconBag /></i></button>
  </>;
}
