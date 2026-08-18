import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { priceLabel } from "@/lib/money/format";
import { loadSharedTrip } from "@/lib/share/server";
import "../share.css";

/** The page a link opens. Public, outside `(app)`, so no session gate and no onboarding
 *  redirect stands between a guest and the list.
 *
 *  Three things are true of everything below:
 *
 *  1. **Nothing on this page came from anywhere but `lib/share/projection.ts`.** The hotel,
 *     the arrival window, the drop-off cutoff, the day-by-day order, the addresses, the
 *     per-person budgets, what was actually spent and every payment field are not in the
 *     data this component receives, so no change here can put them on screen.
 *  2. **The expiry is not shown.** It is `min(issued + 72h, the day after the trip ends)`,
 *     so a date on this page would hand a guest the trip's end date even with the `Trip
 *     dates` switch off. The owner's sheet shows it; they already know their own dates.
 *  3. **The metadata says nothing about the trip.** KakaoTalk, iMessage and Slack fetch a
 *     link to draw a preview card, and "Toronto · Aug 15–19" on that card is the whole
 *     group chat reading the dates without anyone opening anything.
 *
 *  `Sample` / `Simulated` survives the projection and is drawn per row, from the row's own
 *  `source` column (product rule 3, FIGMA_ADOPTION §1-1). A guest is the person least able
 *  to tell curated catalogue data from live inventory. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A Trail gift list",
  description: "Someone shared a gift list with you.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: { title: "A Trail gift list", description: "Someone shared a gift list with you.", images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "TRAIL" }] },
  twitter: { card: "summary_large_image", title: "A Trail gift list", description: "Someone shared a gift list with you.", images: ["/og.jpg"] },
};

const chip = (source: string) => (source === "live" ? "" : source === "simulated" ? "SIMULATED" : "SAMPLE");
const day = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "");
const range = (start: string | null | undefined, end: string | null | undefined) => (start && end ? `${day(start)}–${day(end)}` : day(start ?? end));

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadSharedTrip(token);
  if (!loaded.ok) notFound();                    // 404 + `not-found.tsx`, identically for all four failures

  const { view } = loaded;
  const { trip, plan, gifts, progress, recipients, delivery, scope } = view;
  const dates = scope.dates ? range(trip.startDate, trip.endDate) : "";
  const currency = trip.currency ?? "CAD";

  return <main className="share-screen">
    <div className="share-brand"><Image src="/logo-mark.png" alt="" width={28} height={28} /><b>TRAIL</b><span className="share-badge">View only</span></div>

    <h1>{view.owner.name}’s {trip.city} list</h1>
    <p className="share-sub">{[trip.country, trip.status, dates].filter(Boolean).join(" · ")}</p>
    {plan && <p className="share-taste">{plan.category} · {plan.preference}</p>}

    <section className="share-band">
      <span><b>{progress.bought} of {progress.total}</b><small>bought so far</small></span>
      {scope.prices && plan?.totalCents !== undefined && <span><b>{priceLabel(plan.totalCents, currency)}</b><small>trip budget</small></span>}
      {delivery && <span><b>{delivery.status}</b><small>{delivery.bagCount} bag{delivery.bagCount === 1 ? "" : "s"}{chip(delivery.source) ? ` · ${chip(delivery.source)}` : ""}</small></span>}
    </section>

    <h2 className="share-label">The list</h2>
    {gifts.length
      ? <ul className="share-gifts">{gifts.map((gift, index) => <li key={index}>
          <span>
            <b>{gift.productName}</b>
            <small>{[gift.storeName, gift.area].filter(Boolean).join(" · ")}</small>
            {gift.recipient && <small className="share-for">For {gift.recipient}</small>}
          </span>
          <em>
            {gift.priceCents !== undefined && <strong>{priceLabel(gift.priceCents, currency)}</strong>}
            <i data-status={gift.status}>{gift.status}</i>
            {chip(gift.source) && <span className="share-chip">{chip(gift.source)}</span>}
          </em>
        </li>)}</ul>
      : <p className="share-empty">Nothing has been added to this list yet.</p>}

    {recipients && recipients.length > 0 && <>
      <h2 className="share-label">Who it is for</h2>
      <ul className="share-people">{recipients.map((person) => <li key={person.name}><b>{person.name}</b>{person.groupSize > 1 && <small>×{person.groupSize}</small>}{person.isSelf && <small>For me</small>}</li>)}</ul>
    </>}

    <footer className="share-foot">
      <p>Shared from Trail. This page is read-only — nothing here can be changed, and it shows only what the person who shared it chose to include.</p>
      <p>Trail never puts a hotel, an arrival window, a payment or a tracking code on a shared page.</p>
      <Link href="/">What is Trail?</Link>
    </footer>
  </main>;
}
