"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconBag, IconChilled, IconFragile, IconHotel } from "@/components/icons";
import { useApp } from "../../../app-state";
import { bagsHref } from "../../../landing";
import { price } from "../../../view";

/** The reading half of what used to be one screen. Nothing here commits anything —
 *  every approval gate lives on `/bags/review`, so this lens can be opened at any
 *  point in the trip without a way to start a transfer by accident. */
export default function DeliveryLens() {
  const router = useRouter();
  const app = useApp();
  const { trip, plan, stops, bought, bagCount, quote, partnerCount, loadDropoffPoints } = app;
  useEffect(() => { void loadDropoffPoints(Math.max(1, bagCount)); }, [loadDropoffPoints, bagCount]);
  const handlings = new Set(stops.map((stop) => stop.handling));

  return <>
    <div className="result-title"><p>HOTEL BAG TRANSFER</p><h1>What can be sent ahead.</h1><span>Handling is read from each purchase you record. Nothing is booked from this view.</span></div>
    <section className="handling-list"><header><span><small>TRANSFER CHECK</small><b>Handling on this route</b></span><em>{plan.hotelDelivery ? "REQUESTED" : "OFF"}</em></header><div>
      {handlings.has("Fragile") && <span><i><IconFragile /></i><b>Fragile</b><small>Store packing and a seal photo are required</small></span>}
      {handlings.has("Chilled") && <span><i><IconChilled /></i><b>Chilled</b><small>Four hours from the till, checked per bag</small></span>}
      <span><i><IconBag /></i><b>Standard</b><small>Sealed bags carried as bought</small></span>
      <span><i><IconHotel /></i><b>Hotel</b><small>{trip.hotelName ? `${trip.hotelName} · checked when you confirm` : "Add a hotel in Trips before requesting transfer"}</small></span>
    </div></section>
    <div className="plan-impact"><div><i><IconBag /></i><span><small>PURCHASED BAGS</small><b>{bagCount} bag{bagCount === 1 ? "" : "s"} from {bought.length} stop{bought.length === 1 ? "" : "s"}</b></span></div><div><i><IconHotel /></i><span><small>DELIVERY FEE</small><b>{quote ? price(quote.feeCents, quote.currency) : "Quoted at the counter"}</b></span></div></div>
    {partnerCount === 0 && <div className="budget-warning" role="status"><b>No Trail counter in {trip.city} yet</b><span>You can still record what you buy. Sending bags ahead is not available in this city.</span></div>}
    <div className="ownership-note">For items you already bought. TRAIL does not order products from the store. The fee is quoted by Trail from the partner price list for this city.</div>
    <button className="main-button dark" onClick={() => router.push(bagsHref(app))}><span>{bought.length ? "Choose bags and send them" : "Record a purchase first"}<small>{bought.length ? "You approve every bag before anything moves" : "Transfer starts from a purchase you saved in store"}</small></span><i><IconBag /></i></button>
  </>;
}
