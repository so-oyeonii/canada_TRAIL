"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconArrow, IconBag, IconCheck, IconChilled, IconFragile } from "@/components/icons";
import { isStoredKey, useApp } from "../../app-state";

/** The bag picker, keyed by purchase id instead of a position in an array. A bag
 *  whose purchase has not reached the server yet is listed and not selectable —
 *  it cannot be put on a manifest the server cannot match it to, and saying so is
 *  better than quietly dropping it. */
export default function BagSelectPage() {
  const router = useRouter();
  const { items, toggleItem, selectedBagCount, trip, currency } = useApp();

  return <div className="screen drop-screen"><Header title="Hotel bag transfer" back={() => router.push("/trail/shop")} action={<span className="draft-badge">{selectedBagCount} {selectedBagCount === 1 ? "BAG" : "BAGS"}</span>} />
    <div className="bag-visual"><i>TRAIL</i><i>LOCAL</i><span><IconCheck /></span></div>
    <div className="drop-copy"><p>YOUR PURCHASES · YOUR HOTEL</p><h1>Choose the bags.<br /><em>Keep exploring.</em></h1><span>You paid the stores directly. Trail only carries the sealed, purchased bags you select.</span></div>
    <section className="bag-selector"><header><span><small>PURCHASED BAGS</small><b>Select for hotel transfer</b></span><em>{selectedBagCount} selected</em></header>
      {items.length === 0 && <p className="empty-row">No purchases recorded yet. Save one in store and it appears here.</p>}
      {items.map((item) => { const stored = isStoredKey(item.key); return <label key={item.key}><input type="checkbox" checked={item.selected && stored} disabled={!stored} onChange={() => toggleItem(item.key)} /><span><b>{item.label}</b><small>{stored ? `${item.bags} bag${item.bags === 1 ? "" : "s"} · ${item.handling}` : `${item.bags} bag${item.bags === 1 ? "" : "s"} · waiting to save`}</small></span><i>{item.handling === "Chilled" ? <IconChilled /> : item.handling === "Fragile" ? <IconFragile /> : <IconBag />}</i></label>; })}
    </section>
    <div className="ownership-note">For items you already bought. TRAIL does not order products from the store. The fee and the counter come from Trail’s partner list for {trip.city}, in {currency}.</div>
    <button className="main-button dark" disabled={selectedBagCount === 0} onClick={() => router.push("/bags/review")}><span>Choose a counter and check handling<small>{selectedBagCount === 0 ? "Select at least one purchased bag" : `${selectedBagCount} bag${selectedBagCount === 1 ? "" : "s"} to ${trip.hotelName || "your hotel"}`}</small></span><i><IconArrow /></i></button>
  </div>;
}
