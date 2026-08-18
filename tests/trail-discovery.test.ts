import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { haversineMeters, walkMinutes, walkMinutesBetween, withinRouteTag } from "../lib/discovery/distance.ts";
import { shapeRecommendation, shapeTripSummary } from "../lib/state/shape.ts";
import { storesOf } from "../lib/discovery/use-recommendations.ts";
import type { ProductRow, TripListRow, TripSpendRow } from "../lib/state/rows.ts";

// The traveller's position never leaves the phone: `GET /api/recommendations` takes a city
// name, the shops' own coordinates come back, and the subtraction happens here.

const KENSINGTON = { lat: 43.6547, lng: -79.4009 };            // Blue Banana Market (0011)
const QUEEN_WEST = { lat: 43.6489, lng: -79.3956 };            // Spacing Store (0011)

test("haversine matches a known distance between two seeded stores", () => {
  // ~0.82 km on the ground between Kensington Market and 401 Richmond St W.
  const metres = haversineMeters(KENSINGTON, QUEEN_WEST);
  assert.ok(metres > 750 && metres < 900, `expected roughly 800 m, got ${Math.round(metres)}`);
  assert.equal(Math.round(haversineMeters(KENSINGTON, KENSINGTON)), 0);
});

test("a walking minute is rounded up, never down", () => {
  // Straight-line distance is always shorter than the pavement. A minute that flatters the
  // walk is a traveller who misses a drop-off cutoff.
  assert.equal(walkMinutes(80), 1);
  assert.equal(walkMinutes(81), 2);
  assert.equal(walkMinutes(0), 1, "a store you are standing in is still one minute, not zero");
  assert.equal(walkMinutes(800), 10);
});

test("no position means no walking time — never an estimated one", () => {
  assert.equal(walkMinutesBetween(null, { lat: 43.65, lng: -79.4 }), null);
  assert.equal(walkMinutesBetween(KENSINGTON, null), null);
  assert.equal(walkMinutesBetween(KENSINGTON, { lat: null, lng: null }), null, "a store with no coordinates cannot have a distance");
  assert.equal(walkMinutesBetween(KENSINGTON, QUEEN_WEST), 10);
});

test("route tags read walk minutes, and an unknown walk is not a refusal", () => {
  assert.equal(withinRouteTag(6, "short_walk"), true);
  assert.equal(withinRouteTag(9, "short_walk"), false);
  assert.equal(withinRouteTag(19, "moderate_walk"), true);
  assert.equal(withinRouteTag(45, "any_walk"), true);
  assert.equal(withinRouteTag(null, "short_walk"), true, "a stop with no walk time is not evidence against it");
  assert.equal(withinRouteTag(45, null), true);
});

// ── the source label is per row ──────────────────────────────
const productRow = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: "p-1", name: "Ontario-made ceramic mug", subtitle: "", category: "Home & design", price_cents: 5800,
  price_is_estimate: true, currency: "CAD", handling: "Fragile", weight_grams: 700, preference_tags: ["local", "handmade"],
  source: "sample", source_note: "Public storefront listing, Aug 2026. Price estimated by Trail; not quoted by the store.",
  store: { id: "s-1", name: "Bergo Designs", area: "Distillery District", address: "28 Tank House Ln", lat: 43.6503, lng: -79.3596 },
  ...over,
});

test("a recommendation carries its own source, and one live row does not relabel the rest", () => {
  const sample = shapeRecommendation(productRow());
  const live = shapeRecommendation(productRow({ id: "p-2", source: "live", price_is_estimate: false }));
  assert.equal(sample.source, "sample");
  assert.equal(live.source, "live");
  // FIGMA_ADOPTION §1-1: the chip is read from the row, so a section can never claim
  // "this area is sample data" over a row that has since become real.
  assert.equal(sample.priceIsEstimate, true, "the ~ in front of the price comes from the column");
  assert.equal(live.priceIsEstimate, false);
  assert.ok(sample.sourceNote.includes("not quoted by the store"), "the chip has to be explainable");
});

test("a shop with no opening hours says nothing, which is not the same as `closed`", () => {
  // N2 widened the select rather than adding a column. `openNow` is three-valued because
  // the two negatives are different claims: `isOpenNow` reads "no row for today" as shut,
  // and this null means Trail has never been told this shop's hours at all.
  assert.equal(shapeRecommendation(productRow()).store?.openNow, null, "with no reader, nothing is claimed");
  assert.equal(shapeRecommendation(productRow(), () => null).store?.openNow, null);
  assert.equal(shapeRecommendation(productRow(), () => true).store?.openNow, true);
  assert.equal(shapeRecommendation(productRow(), () => false).store?.openNow, false);
});

test("stores are derived from the feed, deduplicated, and keep their coordinates", () => {
  const stores = storesOf([shapeRecommendation(productRow()), shapeRecommendation(productRow({ id: "p-3" }))]);
  assert.equal(stores.length, 1, "one shop with two products is one card");
  assert.equal(stores[0].lat, 43.6503);
});

test("the recommendations route takes a city, never a position", () => {
  const route = readFileSync(new URL("../app/api/recommendations/route.ts", import.meta.url), "utf8");
  // Comments explain why the coordinates are absent; the code is what must not read one.
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  assert.ok(!/\blat\b|\blng\b|latitude|geolocation/.test(code), "a coordinate the server never receives is one there is nothing to leak");
  assert.match(route, /getTraveler\(\)/);
  assert.match(route, /private, max-age=300/, "the catalogue is the one answer here that is the same for everybody");
  const nearby = readFileSync(new URL("../lib/discovery/nearby.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  assert.ok(!/localStorage|sessionStorage|fetch\(/.test(nearby), "the fix is held in memory and nowhere else");
});

// ── the summary carries numbers, it does not compute them ────
const listRow = (over: Partial<TripListRow> = {}): TripListRow => ({
  id: "trip-1", status: "past", city: "Toronto", country: "Canada", start_date: "2026-08-12", end_date: "2026-08-16",
  currency: "CAD", updated_at: "2026-08-17T00:00:00Z", hotel_name: "The Annex Hotel", timezone: "America/Toronto",
  provisional_until: null, plans: [{ status: "approved", total_cents: 25000 }], bag_transfers: [], ...over,
});
const spendRow = (over: Partial<TripSpendRow> = {}): TripSpendRow => ({ trip_id: "trip-1", purchase_count: 3, spent_cents: 18400, bag_count: 4, budget_cents: 25000, plan_status: "approved", ...over });

test("shapeTripSummary moves the view's numbers across and never adds anything up", () => {
  const withSpend = shapeTripSummary(listRow(), spendRow());
  assert.equal(withSpend.spentCents, 18400);
  assert.equal(withSpend.bagCount, 4);
  assert.equal(withSpend.purchaseCount, 3);
  assert.equal(withSpend.budgetCents, 25000);
  assert.equal(withSpend.hotelName, "The Annex Hotel");
  assert.equal(withSpend.timezone, "America/Toronto");
});

test("no summary view means null, and null is not zero", () => {
  const bare = shapeTripSummary(listRow());
  assert.equal(bare.spentCents, null, "`CAD $0 spent` under a trip that cost 400 is worse than saying nothing was counted");
  assert.equal(bare.bagCount, null);
  assert.equal(bare.purchaseCount, null);
  // The budget still comes off the plan embed, which does not need 0022.
  assert.equal(bare.budgetCents, 25000);
  assert.equal(shapeTripSummary(listRow({ plans: [] })).budgetCents, null);
});

test("a trip with no plan is marked, not drawn as a zero budget", () => {
  const half = shapeTripSummary(listRow({ plans: [], provisional_until: "2026-08-16T11:00:00Z" }));
  assert.equal(half.provisionalUntil, "2026-08-16T11:00:00Z");
  assert.equal(half.budgetCents, null, "a wallet-less trip must not render CAD $0 budget");
});
