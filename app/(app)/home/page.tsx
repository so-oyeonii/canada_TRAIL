"use client";

/** The Home tab (frames Home, -15, -2, -3).
 *
 *  G2 owns the route, the greeting, the failure branch and the approval banner; the trip
 *  context bar's sheet, the `Shopping in` card, the recommendation rail and the nearby
 *  store grid are G3's.
 *
 *  Two clocks used to be read here and neither belonged to the trip. The greeting now
 *  comes from `trip.timezone` (0021) and so does `Day n of m`, so a phone still on home
 *  time cannot say "Good evening" to somebody standing in Toronto at nine in the morning.
 *  Both are drawn only after `hydrated` — the server render has no clock at all.
 *
 *  `Shopping in` is FIGMA_ADOPTION §2's first copy exception. The wireframe says
 *  `Current Location`; this value came out of an onboarding form, not a sensor, and there
 *  is no location permission anywhere in this app. Naming it a location would be the
 *  screen claiming a capability it does not have. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Header } from "@/components/chrome";
import { IconArrow, IconPin, IconRetry, IconSpark } from "@/components/icons";
import { ProductCard, StoreCard, TileSkeleton } from "@/components/discovery";
import { TripContextBar } from "@/components/trip-context-bar";
import { useNearby } from "@/lib/discovery/nearby";
import { walkMinutesBetween } from "@/lib/discovery/distance";
import { storesOf, useRecommendations } from "@/lib/discovery/use-recommendations";
import { dayOfTrip, greetingFor } from "@/lib/trips/status";
import { useApp } from "../app-state";
import { continueHref } from "../landing";
import { useTripSwitcher } from "../trip-switcher";

export default function HomePage() {
  const app = useApp();
  const router = useRouter();
  const { trip, hydrated, status, refresh, pendingBudgetChange } = app;
  const switcher = useTripSwitcher();
  const city = trip?.city ?? "";
  const feed = useRecommendations(city || null);
  const nearby = useNearby();
  const stores = storesOf(feed.products);
  const day = hydrated && trip ? dayOfTrip(trip.startDate, trip.endDate, trip.timezone) : null;

  return <div className="screen home-screen"><Header action={<Avatar city={city || "T"} />} />
    <TripContextBar trip={trip ? { id: trip.id, city: trip.city, country: trip.country } : null} day={day} onOpenSwitcher={switcher.open} switcherOpen={switcher.isOpen} />
    {switcher.sheet}

    <section className="home-greeting"><h1>{hydrated && trip ? greetingFor(trip.timezone) : "Hello."}</h1><p>{city ? `Ready to explore ${city}?` : "Ready to plan your first trip?"}</p></section>

    {status === "error" && <div className="offline-note"><b>Trail could not load this account.</b><span>You are seeing what this device saved. Nothing you recorded has been lost.</span><button className="back-to-chat" onClick={() => void refresh()}><IconRetry /> Try again</button></div>}
    {pendingBudgetChange && <button className="approval-banner" onClick={() => router.push("/trail/plan/approval")}><span><small>NEEDS YOUR APPROVAL</small><b>{pendingBudgetChange.reason}</b></span><IconArrow /></button>}

    {trip
      ? <>
          {/* The wireframe's `Current Location` card. The value is `trips.city`, typed into
              a form, so the label says where the shopping is rather than where the phone is. */}
          <div className="home-place"><i><IconPin /></i><span><small>SHOPPING IN</small><b>{trip.city}{trip.country ? `, ${trip.country}` : ""}</b></span>{trip.hotelName && <em>{trip.hotelName}</em>}</div>

          {/* N2's first entry point, and one line of this file: the traveller who has a
              gap is standing in the city this card names. */}
          <Link className="text-action spare-entry" href="/trail/spare">I have some time &rarr;</Link>

          <div className="profile-section-label"><b>CURRENT</b><span>{day ? `Day ${day.n} of ${day.of}` : trip.status === "planning" ? "Not started yet" : "Dates not set"}</span></div>
          <Link className="plan-row" href={continueHref(app)}><span><b>{app.shoppingStarted ? `Continue ${trip.city} Trail` : app.stops.length ? "Open" : "Plan shopping"}</b><small>{app.shoppingStarted ? "Today’s route, your budget and your bags" : app.stops.length ? `Your plan for ${trip.city}` : "Tell Trail who you are shopping for"}</small></span><IconArrow /></Link>
          <Link className="plan-row" href="/ask"><span><b>Plan with AI</b><small>Plan · What to buy · Where to buy</small></span><IconSpark /></Link>
        </>
      : <Link className="plan-row" href="/trips"><span><b>Choose a trip</b><small>Nothing is open right now</small></span><IconArrow /></Link>}

    {city && <>
      <section className="reco-rail" aria-labelledby="home-reco">
        <div className="profile-section-label"><b id="home-reco">{city.toUpperCase()} RECOMMENDATIONS</b><span>Popular souvenirs in {city}</span></div>
        {feed.loading
          ? <ul><TileSkeleton count={4} /></ul>
          : feed.products.length
            ? <ul>{feed.products.map((product) => <ProductCard key={product.id} product={product} />)}</ul>
            : <p className="trip-empty">{feed.error === "offline" ? "You are offline, so Trail cannot read the shop list right now." : `Trail has no shop list for ${city} yet.`}</p>}
      </section>

      {stores.length > 0 && <section aria-labelledby="home-stores">
        <div className="profile-section-label"><b id="home-stores">Nearby Stores</b><span>{nearby.status === "ready" ? "Walking times from where you are" : `${stores.length} in ${city}`}</span></div>
        {/* The permission prompt is always behind a tap, the fix is held in memory only,
            and a refusal leaves every walking time null rather than estimated. */}
        {nearby.status !== "ready" && <button type="button" className="back-to-chat" onClick={nearby.ask}>{nearby.status === "asking" ? "Asking…" : nearby.status === "denied" ? "Location is off — showing neighbourhoods" : nearby.status === "unavailable" ? "This device cannot give a position" : "Use my location for walking times"}</button>}
        <ul className="store-grid">{stores.map((store) => <StoreCard key={store.id} store={store} source={store.source} note={store.sourceNote} walkMinutes={walkMinutesBetween(nearby.point, store)} />)}</ul>
      </section>}
    </>}
  </div>;
}
