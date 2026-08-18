"use client";

/** `Made for {city}` (frame -3).
 *
 *  Every section on this screen is a filter over real rows, not a heading with a mood.
 *
 *  - `POPULAR LOCAL GIFTS` is the distinct `products.category` values for this city. Four
 *    rows in the frame; however many the catalogue actually has here.
 *  - `NEAR YOUR ITINERARY` counts shops, and says `within {m} min` only when the traveller
 *    has granted a position on this screen. Otherwise it names the neighbourhoods. No
 *    walking time is ever invented.
 *  - `Easy to bring home` is `handling = 'Standard'` and a weight under 1 kg — a real
 *    filter, so the section can legitimately be empty.
 *  - `TRAIL REMEMBERS` renders only when `memory_constraints` has rows. The wireframe's
 *    sentence about Tokyo ceramics is data, not copy; with no rows there is no card.
 *    With memory switched off the card explains that this feed is not being filtered,
 *    which is the one place in the app where the toggle's effect is visible.
 *
 *  `Yes — something different` writes through `POST /api/memory`, and `consented_at` is
 *  the server's clock. A browser does not get to say when consent was given. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/chrome";
import { IconCheck, IconGift, IconLeaf, IconMap, IconShop, IconSpark } from "@/components/icons";
import { LocationChip, ProductCard, TileSkeleton } from "@/components/discovery";
import { useNearby } from "@/lib/discovery/nearby";
import { walkMinutesBetween } from "@/lib/discovery/distance";
import { storesOf, useRecommendations } from "@/lib/discovery/use-recommendations";
import type { MemoryConstraint } from "@/lib/state/types";
import { useTrip } from "../../app-state";
import { NearbyBanner } from "../../nearby-banner";

const CATEGORY_ICON: Record<string, (p: { className?: string }) => React.JSX.Element> = {
  "Home & design": IconShop, "Food & treats": IconLeaf, "Art & stationery": IconMap, "Open to ideas": IconGift,
};
const EASY_GRAMS = 1000;

export default function MadeForCityPage() {
  const router = useRouter();
  const { trip, memoryEnabled, tripId, notify } = useTrip();
  const feed = useRecommendations(trip.city, 24);
  const nearby = useNearby();
  const stores = storesOf(feed.products);
  const [memory, setMemory] = useState<MemoryConstraint[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  // The only `setState` here is inside the fetch callbacks. Offline lands on an empty
  // list, which renders no card at all rather than a card claiming nothing is remembered.
  useEffect(() => {
    let live = true;
    fetch("/api/memory", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => { if (!live) return; if (!res.ok) { setMemory([]); return; } const body = (await res.json()) as { constraints?: MemoryConstraint[] }; if (live) setMemory(body.constraints ?? []); })
      .catch(() => { if (live) setMemory([]); });
    return () => { live = false; };
  }, [reload]);

  const categories = [...new Set(feed.products.map((product) => product.category))];
  const easy = feed.products.filter((product) => product.handling === "Standard" && (product.weightGrams === null || product.weightGrams <= EASY_GRAMS));
  const walks = stores.map((store) => walkMinutesBetween(nearby.point, store)).filter((minutes): minutes is number => minutes !== null);
  const areas = [...new Set(stores.map((store) => store.area).filter(Boolean))];

  const remember = async (value: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memory", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "avoid", value, tripId }) });
      if (res.ok) { setReload((n) => n + 1); notify("Trail will remember that"); } else notify("Trail could not save that. Nothing was changed.");
    } catch { notify("You are offline. Nothing was saved."); }
    setSaving(false);
  };

  return <div className="screen made-for-screen"><Header title={`Made for ${trip.city}`} back={() => router.push("/trail")} />

    <NearbyBanner products={feed.products} />

    <section aria-labelledby="mf-gifts">
      <div className="profile-section-label"><b id="mf-gifts">Popular local gifts</b><span>{categories.length || 0} kinds in {trip.city}</span></div>
      {feed.loading
        ? <ul className="reco-rail"><TileSkeleton count={3} /></ul>
        : categories.length
          ? <div className="mf-categories">{categories.map((category) => { const Icon = CATEGORY_ICON[category] ?? IconGift; const count = feed.products.filter((p) => p.category === category).length; return <Link key={category} className="plan-row" href="/trail/plan/gifts"><span><b>{category}</b><small>{count} {count === 1 ? "idea" : "ideas"} in this city</small></span><Icon /></Link>; })}</div>
          : <p className="trip-empty">Trail has no shop list for {trip.city} yet, so there is nothing to sort into kinds.</p>}
    </section>

    <section aria-labelledby="mf-near">
      <div className="profile-section-label"><b id="mf-near">Near your itinerary</b><span>{stores.length} {stores.length === 1 ? "store" : "stores"}</span></div>
      {/* A number of minutes needs a position. Without one this says where, not how far. */}
      <p className="recipient-note">{walks.length ? `${walks.length} ${walks.length === 1 ? "store" : "stores"} within ${Math.max(...walks)} min of you.` : areas.length ? `${stores.length} ${stores.length === 1 ? "store" : "stores"} in ${areas.join(", ")}.` : "No stores listed for this city yet."}</p>
      {nearby.point
        ? <LocationChip live={nearby.watching} onTurnOff={nearby.forget} />
        : stores.length > 0 && <button type="button" className="back-to-chat" onClick={nearby.ask}>{nearby.status === "asking" ? "Asking…" : nearby.status === "denied" ? "Location is off — showing neighbourhoods" : nearby.status === "unavailable" ? "This device cannot give a position" : "Use my location for walking times"}</button>}
    </section>

    <section className="reco-rail" aria-labelledby="mf-easy">
      <div className="profile-section-label"><b id="mf-easy">Easy to bring home</b><span>Standard handling, under 1 kg</span></div>
      {feed.loading
        ? <ul><TileSkeleton count={4} /></ul>
        : easy.length
          ? <ul>{easy.map((product) => <ProductCard key={product.id} product={product} />)}</ul>
          : <p className="trip-empty">Nothing in this city’s list packs light enough for that yet.</p>}
    </section>

    {memory && memory.length > 0 && <section className="ai-memory-card" aria-labelledby="mf-remember">
      <header><i><IconSpark /></i><span><small id="mf-remember">Trail remembers</small><b>{memoryEnabled ? "Used to rank this list" : "Not being used right now"}</b></span><em>{memory.length}</em></header>
      <ul className="mf-memory">{memory.map((row) => <li key={row.id}><b>{row.kind === "avoid" ? "Avoid" : "Prefer"}</b> {row.value}</li>)}</ul>
      {memoryEnabled
        ? <p>Trail ranks the list above with these. Every route and every transfer is still yours to approve.</p>
        : <p>Memory is off, so this list is built from this trip alone. <Link href="/account/memory">Memory &amp; privacy</Link></p>}
    </section>}

    {memory && <div className="offline-note"><b>Want something different this time?</b><span>Trail can remember to keep a kind of gift out of your lists. It is stored against your account, with the time you said so, and you can take it back on the memory screen.</span><button className="back-to-chat" disabled={saving} onClick={() => void remember(`Repeat gifts from ${trip.city}`)}><IconCheck /> {saving ? "Saving…" : "Yes — something different"}</button></div>}
  </div>;
}
