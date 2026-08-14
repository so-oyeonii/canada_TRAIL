"use client";

/** The executing half of the old `drop` screen. `/trail/plan/delivery` reads the
 *  same facts with no gate; everything that commits is here. */

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconArrow, IconChilled, IconFragile, IconHotel } from "@/components/icons";
import { DELIVERY_FEE, useApp } from "../../app-state";

export default function BagReviewPage() {
  const router = useRouter();
  const { bought, purchases, selectedBags, selectedBagCount, trip } = useApp();
  const selected = bought.filter((stop) => selectedBags[stop.id]);
  const eligible = selectedBagCount > 0 && Boolean(trip.hotel.trim());

  return <div className="screen drop-screen"><Header title="Review transfer" back={() => router.push("/bags/select")} action={<span className="draft-badge">SIMULATED</span>} />
    <div className="drop-copy"><p>BEFORE ANYTHING MOVES</p><h1>Check the handling.</h1><span>Trail carries sealed bags you already paid for. Confirm what needs care before you approve the delivery.</span></div>
    <section className="handling-list"><header><span><small>SAMPLE TRANSFER CHECK</small><b>Handling and hotel conditions</b></span><em>{eligible ? "ELIGIBLE" : "NEEDS INFO"}</em></header><div>
      {selected.some((stop) => purchases[stop.id].handling === "Fragile") && <span><i><IconFragile /></i><b>Fragile</b><small>Store packing and seal photo required</small></span>}
      {selected.some((stop) => purchases[stop.id].handling === "Chilled") && <span><i><IconChilled /></i><b>Chilled</b><small>Sample ice-pack window until 7:30 PM</small></span>}
      <span><i><IconHotel /></i><b>Hotel</b><small>{trip.hotel ? "Sample front desk acceptance" : "Hotel is missing — add one in Trips"}</small></span>
    </div></section>
    <div className="drop-pass"><div><span>SAMPLE BAG TRANSFER PASS</span><b>TR–2718</b></div><div className="barcode" aria-hidden="true" /><small>{trip.hotel} · sample ETA 6:30–7:00 PM · estimated CAD ${DELIVERY_FEE}</small></div>
    <div className="ownership-note">Partner, price and ETA are prototype simulations. Nothing is charged until you approve the next screen.</div>
    <button className="main-button dark" disabled={!eligible} onClick={() => router.push("/bags/pay")}><span>Review and pay for delivery<small>{eligible ? `CAD $${DELIVERY_FEE} reserved · nothing charged yet` : "Select a bag and add a hotel first"}</small></span><i><IconArrow /></i></button>
  </div>;
}
