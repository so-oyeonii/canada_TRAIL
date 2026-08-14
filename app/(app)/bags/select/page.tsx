"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconArrow, IconBag, IconCheck, IconChilled, IconFragile } from "@/components/icons";
import { useApp } from "../../app-state";

export default function BagSelectPage() {
  const router = useRouter();
  const { bought, purchases, selectedBags, setSelectedBags, selectedBagCount, trip } = useApp();

  return <div className="screen drop-screen"><Header title="Hotel bag transfer" back={() => router.push("/trail/shop")} action={<span className="draft-badge">{selectedBagCount} {selectedBagCount === 1 ? "BAG" : "BAGS"}</span>} />
    <div className="bag-visual"><i>TRAIL</i><i>LOCAL</i><span><IconCheck /></span></div>
    <div className="drop-copy"><p>YOUR PURCHASES · YOUR HOTEL</p><h1>Choose the bags.<br /><em>Keep exploring.</em></h1><span>You paid the stores directly. Trail only carries the sealed, purchased bags you select.</span></div>
    <section className="bag-selector"><header><span><small>PURCHASED BAGS</small><b>Select for hotel transfer</b></span><em>{selectedBagCount} selected</em></header>
      {bought.length === 0 && <p className="empty-row">No purchases recorded yet. Save one in store and it appears here.</p>}
      {bought.map((stop) => { const purchase = purchases[stop.id]; return <label key={stop.id}><input type="checkbox" checked={Boolean(selectedBags[stop.id])} onChange={(event) => setSelectedBags((current) => ({ ...current, [stop.id]: event.target.checked }))} /><span><b>{stop.store}</b><small>{purchase.bags} bag{purchase.bags === 1 ? "" : "s"} · {purchase.handling} · CAD ${purchase.actualPrice}</small></span><i>{purchase.handling === "Chilled" ? <IconChilled /> : purchase.handling === "Fragile" ? <IconFragile /> : <IconBag />}</i></label>; })}
    </section>
    <div className="ownership-note">For items you already bought. TRAIL does not order products from the store. Partner, price and ETA are prototype simulations.</div>
    <button className="main-button dark" disabled={selectedBagCount === 0} onClick={() => router.push("/bags/review")}><span>Check handling and hotel<small>{selectedBagCount === 0 ? "Select at least one purchased bag" : `${selectedBagCount} bag${selectedBagCount === 1 ? "" : "s"} to ${trip.hotel || "your hotel"}`}</small></span><i><IconArrow /></i></button>
  </div>;
}
