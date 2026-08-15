import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, UUID } from "@/lib/api/http";
import { cutoffInstant, isOpenNow, minutesUntil, quoteFee } from "@/lib/transfers/clock";
import { loadPricing, loadTrip, resolveTripId, STORE_SELECT, type StoreRowLite } from "@/lib/transfers/context";
import type { DropoffPoint, Handling } from "@/lib/state/types";

/** The counters a traveler can actually walk to, with the cutoff already
 *  resolved to an instant.
 *
 *  `stores.dropoff_cutoff` is a wall clock `time` — 18:00 in the shop, not 18:00
 *  UTC — so a screen that parsed it would either refuse a traveler with four
 *  hours left or take money for a run that cannot happen. The zone comes from
 *  the store row and the arithmetic happens here, once.
 *
 *  `source` travels with every point. The Sample/Simulated chip reads it, so the
 *  label cannot drift from the data it is describing (constitution 3). */
export const dynamic = "force-dynamic";

type HoursRow = { store_id: string; weekday: number; opens: string; closes: string };

export async function GET(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const params = new URL(request.url).searchParams;
  const askedTrip = params.get("tripId");
  if (askedTrip && !UUID.test(askedTrip)) return json({ error: "bad_trip_id" }, 400);
  const bagsParam = Number(params.get("bags") ?? "0");
  const bags = Number.isFinite(bagsParam) && bagsParam > 0 ? Math.min(Math.floor(bagsParam), 40) : 0;

  const db = await createClient();
  let city = (params.get("city") ?? "").slice(0, 80);
  if (!city) {
    const tripId = await resolveTripId(db, askedTrip);
    const trip = tripId ? await loadTrip(db, tripId) : null;
    if (!trip) return json({ error: "trip_not_found" }, 404);
    city = trip.city;
  }

  const now = new Date();
  const [found, pricing] = await Promise.all([
    db.from("stores").select(STORE_SELECT).eq("city", city).eq("is_partner_point", true).order("name", { ascending: true }),
    loadPricing(db, city, now),
  ]);
  if (found.error) return json({ error: "dropoff_points_unavailable", detail: found.error.message }, 500);
  const stores = (found.data ?? []) as StoreRowLite[];

  const hours = stores.length
    ? ((await db.from("store_hours").select("store_id, weekday, opens, closes").in("store_id", stores.map((s) => s.id))).data ?? []) as HoursRow[]
    : [];

  const points: DropoffPoint[] = stores.map((s) => {
    const timezone = s.timezone ?? "America/Toronto";
    const cutoff = cutoffInstant(now, s.dropoff_cutoff, timezone);
    return {
      id: s.id, name: s.name, address: s.address, area: s.area, lat: s.lat, lng: s.lng,
      acceptedHandling: (s.accepted_handling ?? ["Standard"]) as Handling[], maxWeightGrams: s.max_weight_grams,
      timezone, dropoffOpens: s.dropoff_opens, dropoffCutoff: s.dropoff_cutoff,
      cutoffAt: cutoff ? cutoff.toISOString() : null, minutesToCutoff: cutoff ? minutesUntil(cutoff, now) : null,
      open: isOpenNow(now, timezone, hours.filter((h) => h.store_id === s.id)),
      partnerNote: s.partner_note ?? "", source: s.source,
    };
  });

  // No partner in this city is `no_partner_nearby`, and it is a fact about rows.
  // The count travels so the screen does not have to infer it from an empty list.
  return json({ city, points, partnerCount: points.length, quote: quoteFee(pricing, bags), pricingSource: pricing ? "table" : "fallback", serverTime: now.toISOString() }, 200);
}
