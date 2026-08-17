"use client";

/** The two sample trips this screen used to show were prototype fiction with a
 *  "spend" nobody had spent. It lists the trips on the account now, and says so
 *  when there are none. */

import { useRouter } from "next/navigation";
import { Header } from "@/components/chrome";
import { IconChevronRight, IconSpark } from "@/components/icons";
import { useApp } from "../../app-state";
import { dateRange, price } from "../../view";

export default function PastTripsPage() {
  const router = useRouter();
  const { trips, trip, pastTransfers } = useApp();
  const others = trips.filter((entry) => entry.id !== trip.id);

  return <div className="screen profile-screen"><Header title="Past trips" back={() => router.push("/trips")} />
    <div className="profile-section-label history-label"><b>Your trips</b><span>{trips.length} on this account</span></div>
    <h1 className="visually-hidden">Past trips</h1>
    <section className="trip-history">
      {!others.length && <article><button><i className="blue">{(trip.city[0] ?? "T").toUpperCase()}</i><span><small>{dateRange(trip.startDate, trip.endDate)}</small><b>{trip.city}, {trip.country}</b><em>This is your only trip so far</em></span><b><IconChevronRight /></b></button></article>}
      {others.map((entry) => <article key={entry.id}><button onClick={() => router.push("/trips")}><i className="peach">{(entry.city[0] ?? "T").toUpperCase()}</i><span><small>{dateRange(entry.startDate, entry.endDate)}</small><b>{entry.city}, {entry.country}</b><em>{entry.purchaseCount} purchase{entry.purchaseCount === 1 ? "" : "s"} · {entry.status}</em></span><strong>{entry.currency}</strong><b><IconChevronRight /></b></button></article>)}
    </section>
    {pastTransfers.length > 0 && <section className="handling-list"><header><span><small>FINISHED DELIVERIES</small><b>Bags Trail has carried</b></span><em>{pastTransfers.length}</em></header><div>{pastTransfers.map((entry) => <span key={entry.id}><i><IconSpark /></i><b>{entry.hotelName || "Hotel"}</b><small>{entry.bagCount} bag{entry.bagCount === 1 ? "" : "s"} · {price(entry.feeCents, entry.currency)} · {entry.status}</small></span>)}</div></section>}
    <div className="offline-note"><b>Trip memory is still growing.</b><span>Trail learns from the trips you finish. Nothing on this screen is sample data any more.</span></div>
  </div>;
}
