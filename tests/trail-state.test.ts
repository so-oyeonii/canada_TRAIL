import assert from "node:assert/strict";
import test from "node:test";
import { computeWallet, newestTimestamp, pickPlan, shapeState, splitTransfers } from "../lib/state/shape.ts";
import { boughtStops, deliveryStep, draftItems, purchaseAt, routeStops, savedStops, selectedBagCount, stopById } from "../lib/state/selectors.ts";
import { adoptLegacyOutbox, CACHE_PREFIX, CACHE_TRIP_LIMIT, cacheKey, dropOtherCaches, readCache, readIndex, readOutbox, writeCache, writeIndex, writeOutbox } from "../lib/state/store.ts";
import { classify, enqueue, flush, newOp } from "../lib/state/outbox.ts";
import type { TripRow } from "../lib/state/rows.ts";
import type { TrailState } from "../lib/state/types.ts";

const STOP_A = "11111111-1111-4111-8111-111111111111";
const STOP_B = "22222222-2222-4222-8222-222222222222";
const STOP_OLD = "33333333-3333-4333-8333-333333333333";

const purchaseRow = (id: string, stopId: string | null, cents: number, over = {}) => ({ id, stop_id: stopId, actual_price_cents: cents, quantity: 1, bags: 1, handling: "Standard" as const, currency: "CAD", note: null, unplanned_label: null, recorded_at: "2026-08-15T15:00:00+00:00", voided_at: null, void_reason: null, updated_at: "2026-08-15T15:00:00+00:00", ...over });

const stopRow = (id: string, sequence: number, over = {}) => ({ id, plan_id: "plan-1", sequence, planned_day: 1, status: "planned" as const, recipient_id: null, product_name: `Gift ${sequence}`, store_name: `Store ${sequence}`, store_address: "", area: "The Annex", snapshot_price_cents: 5800, handling: "Standard" as const, walk_minutes: 7, rationale: "", saved: false, replaced_stop_id: null, source: "sample" as const, updated_at: "2026-08-15T15:00:00+00:00", purchases: null, store_inquiries: null, ...over });

const planRow = (over = {}) => ({ id: "plan-1", status: "approved" as const, version: 2, total_cents: 25000, planned_cents: 21000, delivery_reserve_cents: 900, flexible_cents: 3100, category: "Home & design", preference: "Thoughtful and useful", local_only: true, easy_pack: true, hotel_delivery: true, approved_at: "2026-08-14T09:02:11+00:00", updated_at: "2026-08-14T09:02:11+00:00", plan_allocations: [{ recipient_id: "r1", amount_cents: 8000, bucket: "planned" as const }, { recipient_id: "r2", amount_cents: 6000, bucket: "planned" as const }], ...over });

const tripRow = (over: Partial<TripRow> = {}): TripRow => ({ id: "trip-1", status: "active", country: "Canada", city: "Toronto", areas: ["The Annex"], start_date: "2026-08-12", end_date: "2026-08-16", hotel_name: "The Annex Hotel", hotel_address: "296 Brunswick Ave", hotel_verified_at: null, companions: "Solo trip", free_time: "3 hours", currency: "CAD", updated_at: "2026-08-15T18:19:55.402+00:00", plans: [planRow()], recipients: [], stops: [stopRow(STOP_A, 0, { status: "bought", saved: true, purchases: [purchaseRow("p-1", STOP_A, 7500)] }), stopRow(STOP_B, 1)], unplanned_purchases: [], bag_transfers: [], ...over } as TripRow);

const build = (over: Partial<TripRow> = {}): TrailState => shapeState({ user: null, userId: "u-1", email: "traveler@example.com", trip: tripRow(over), list: [], serverTime: "2026-08-15T18:22:04.113Z" });

test("the response carries no array index anywhere", () => {
  const state = build();
  const keys = new Set<string>();
  const walk = (value: unknown) => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { keys.add(k); walk(v); } };
  walk(state);
  for (const banned of ["index", "purchases", "selectedBags", "replacementIds", "savedStops"]) assert.ok(!keys.has(banned), `${banned} is still in the state`);
  assert.ok(keys.has("stops") && keys.has("id"));
});

test("a purchase is reached by stop uuid, and reordering stops does not move it", () => {
  const state = build();
  assert.equal(purchaseAt(state, STOP_A)?.actualPriceCents, 7500);
  assert.equal(purchaseAt(state, STOP_B), null);
  const reordered = build({ stops: [stopRow(STOP_B, 0), stopRow(STOP_A, 1, { status: "bought", saved: true, purchases: [purchaseRow("p-1", STOP_A, 7500)] })] });
  assert.equal(purchaseAt(reordered, STOP_A)?.actualPriceCents, 7500, "the spend followed the stop, not the position");
  assert.equal(purchaseAt(reordered, STOP_B), null);
  assert.equal(stopById(reordered, STOP_A)?.sequence, 1);
});

test("a voided purchase stops counting but the row is still there", () => {
  const state = build({ stops: [stopRow(STOP_A, 0, { status: "bought", purchases: [purchaseRow("p-1", STOP_A, 7500, { voided_at: "2026-08-15T16:00:00+00:00", void_reason: "refunded" })] })] });
  assert.equal(purchaseAt(state, STOP_A), null);
  assert.equal(stopById(state, STOP_A)?.purchase?.voidedAt, "2026-08-15T16:00:00+00:00");
  assert.equal(state.wallet.spentCents, 0);
  assert.equal(boughtStops(state).length, 0);
});

test("saved stops are a column, not a parallel map", () => {
  assert.deepEqual(savedStops(build()).map((s) => s.id), [STOP_A]);
});

test("a replacement is a new stop, and the stop it replaced leaves the route", () => {
  const state = build({ stops: [stopRow(STOP_OLD, 0), stopRow(STOP_A, 1, { replaced_stop_id: STOP_OLD })] });
  assert.deepEqual(routeStops(state).map((s) => s.id), [STOP_A]);
  assert.equal(stopById(state, STOP_OLD)?.id, STOP_OLD, "the replaced stop is still readable as history");
});

test("the wallet never adds the delivery reserve to what can be spent", () => {
  const state = build({ stops: [stopRow(STOP_A, 0, { status: "bought", purchases: [purchaseRow("p-1", STOP_A, 17600)] })] });
  assert.deepEqual(state.wallet, { totalCents: 25000, plannedCents: 21000, reserveCents: 900, flexibleCents: 3100, spentCents: 17600, spendableCents: 3400, unallocatedCents: 7000, allocatedCents: 14000, overPlan: false });
});

test("spend with no stop still counts against the budget", () => {
  const state = build({ unplanned_purchases: [purchaseRow("p-9", null, 500000, { unplanned_label: "Bookshop tote" })] });
  assert.equal(state.wallet.spentCents, 507500);
  assert.equal(state.wallet.overPlan, true);
  assert.equal(state.unplannedPurchases.length, 1);
});

test("with no plan the wallet reports real spend and refuses to invent a budget", () => {
  const wallet = computeWallet(null, [], [{ id: "p", stopId: null, actualPriceCents: 4200, quantity: 1, bags: 1, handling: "Standard", currency: "CAD", note: null, unplannedLabel: "Tote", clientKey: null, recordedAt: "", voidedAt: null, voidReason: null }]);
  assert.equal(wallet.spentCents, 4200);
  assert.equal(wallet.plannedCents, 0);
  assert.equal(wallet.overPlan, false);
});

test("the approved plan wins over a newer draft, and superseded versions never show", () => {
  assert.equal(pickPlan([planRow({ id: "old", status: "superseded" })]), null);
  assert.equal(pickPlan([planRow({ id: "draft", status: "draft", version: 3 }), planRow({ id: "live", status: "approved", version: 2 })])?.id, "live");
  assert.equal(pickPlan([planRow({ id: "d1", status: "draft", version: 1 }), planRow({ id: "d2", status: "draft", version: 4 })])?.id, "d2");
});

test("the server decides which transfer is live; cancelled and failed ones still come back", () => {
  const transfer = (id: string, status: string, createdAt: string) => ({ id, status, reference_code: `TRL-${id}`, hotel_name: "H", hotel_address: "", bag_count: 1, weight_grams: null, fee_cents: 1500, currency: "CAD", eta_start: null, eta_end: null, dropoff_cutoff_at: null, confirmed_at: null, delivered_at: null, ineligible_reason: null, source: "simulated", created_at: createdAt, updated_at: createdAt, dropoff_store: null, bag_transfer_items: null, transfer_events: null, payments: null, receipts: null });
  const rows = [transfer("a", "delivered", "2026-08-13T10:00:00+00:00"), transfer("b", "failed", "2026-08-15T10:00:00+00:00"), transfer("c", "cancelled", "2026-08-14T10:00:00+00:00")] as unknown as NonNullable<TripRow["bag_transfers"]>;
  const split = splitTransfers(rows);
  assert.equal(split.transfer?.id, "b", "a failed handoff is the screen the traveler needs");
  assert.deepEqual(split.pastTransfers.map((t) => t.id), ["c", "a"]);
});

test("transfer events arrive in ledger order and the delivery step is read from them", () => {
  const event = (seq: number, eventType: string) => ({ id: `e${seq}`, seq, event_type: eventType, actor: "system", item_id: null, occurred_at: "2026-08-15T20:00:00+00:00", created_at: "2026-08-15T20:00:00+00:00", location: null, note: null, payload: null, source: "simulated" });
  const rows = [{ id: "t", status: "in_transit", reference_code: "TRL-1", hotel_name: "H", hotel_address: "", bag_count: 1, weight_grams: null, fee_cents: 1500, currency: "CAD", eta_start: null, eta_end: null, dropoff_cutoff_at: null, confirmed_at: null, delivered_at: null, ineligible_reason: null, source: "simulated", created_at: "2026-08-15T20:00:00+00:00", updated_at: "2026-08-15T20:00:00+00:00", dropoff_store: null, bag_transfer_items: null, transfer_events: [event(2, "collected"), event(0, "created"), event(1, "dropped_off")], payments: null, receipts: null }] as unknown as NonNullable<TripRow["bag_transfers"]>;
  const state = build({ bag_transfers: rows });
  assert.deepEqual(state.transfer?.events.map((e) => e.seq), [0, 1, 2]);
  assert.equal(deliveryStep(state.transfer!.events), 1);
  assert.equal(deliveryStep([]), -1, "no custody event means no step, not step zero");
});

test("the bag picker is keyed by purchase id and pre-selects what the draft holds", () => {
  const rows = [{ id: "t", status: "draft", reference_code: "TRL-1", hotel_name: "H", hotel_address: "", bag_count: 1, weight_grams: null, fee_cents: 0, currency: "CAD", eta_start: null, eta_end: null, dropoff_cutoff_at: null, confirmed_at: null, delivered_at: null, ineligible_reason: null, source: "simulated", created_at: "2026-08-15T20:00:00+00:00", updated_at: "2026-08-15T20:00:00+00:00", dropoff_store: null, bag_transfer_items: [{ id: "it-1", purchase_id: "p-1", label: "", bags: 2, handling: "Standard", weight_grams: null, seal_id: null, sealed_at: null, scanned_at: null }, { id: "it-2", purchase_id: null, label: "Bookshop tote", bags: 1, handling: "Standard", weight_grams: null, seal_id: null, sealed_at: null, scanned_at: null }], transfer_events: null, payments: null, receipts: null }] as unknown as NonNullable<TripRow["bag_transfers"]>;
  const items = draftItems(build({ bag_transfers: rows }));
  assert.deepEqual(items.map((i) => i.key), ["p-1", "it-2"]);
  assert.equal(items[0].selected, true);
  assert.equal(selectedBagCount(items), 2);
});

test("labels come from the source column, not from copy", () => {
  assert.deepEqual(build().labels, { stops: "sample", transfer: null, payment: null });
});

test("stateVersion compares instants, not strings", () => {
  assert.equal(newestTimestamp(["2026-08-15T18:19:55.402+00:00", "2026-08-15T18:19:55.4+00:00"], "2026-01-01T00:00:00Z"), "2026-08-15T18:19:55.402+00:00");
  assert.equal(build().stateVersion, "2026-08-15T18:19:55.402+00:00");
});

test("an account with no trip gets a whole empty state, not a missing one", () => {
  const state = shapeState({ user: null, userId: "u-1", email: "t@example.com", trip: null, list: [], serverTime: "2026-08-15T18:22:04.113Z" });
  assert.equal(state.trip, null);
  assert.equal(state.activeTripId, null);
  assert.deepEqual(state.stops, []);
  assert.equal(state.wallet.totalCents, 0);
  assert.equal(state.user.memoryEnabled, false, "memory stays opt-in when there is no row yet");
});

// ── cache ────────────────────────────────────────────────────
class FakeStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

test("the cache is namespaced per user and another traveler's copy is dropped", () => {
  const storage = new FakeStorage();
  writeCache(storage, "user-a", "trip-1", build());
  writeCache(storage, "user-b", "trip-1", build());
  assert.ok(readCache(storage, "user-a", "trip-1"));
  dropOtherCaches(storage, "user-b");
  assert.equal(readCache(storage, "user-a", "trip-1"), null, "a shared phone must not keep the previous traveler's trip");
  assert.ok(readCache(storage, "user-b", "trip-1"));
  dropOtherCaches(storage, null);
  assert.equal(readCache(storage, "user-b", "trip-1"), null);
});

test("one traveller's other trips survive the sweep that drops another traveller's", () => {
  const storage = new FakeStorage();
  writeCache(storage, "user-a", "trip-1", build());
  writeCache(storage, "user-a", "trip-2", build());
  writeIndex(storage, "user-a", [], "trip-2");
  dropOtherCaches(storage, "user-a");
  // Both are this user's, and both are the offline copy of a trip they can switch to.
  assert.ok(readCache(storage, "user-a", "trip-1"), "switching trips underground would have nothing to paint");
  assert.ok(readCache(storage, "user-a", "trip-2"));
  assert.ok(readIndex(storage, "user-a"));
});

test("the outbox belongs to the traveller, not to the trip they had open", () => {
  const storage = new FakeStorage();
  const queued = [newOp("PUT", "/api/purchases/s-1", { actualPriceCents: 4200 }, "op-1")];
  writeOutbox(storage, "user-a", queued);
  // The v4 shape kept the queue inside the trip entry, so this next line used to erase a
  // purchase recorded in a basement the moment the traveller opened another city.
  writeCache(storage, "user-a", "trip-2", build());
  assert.equal(readOutbox(storage, "user-a").length, 1, "an unsent purchase was lost by switching trips");
  assert.equal(readOutbox(storage, "user-a")[0].opId, "op-1");
});

test("only three trips keep a full copy, and the newest survive", () => {
  const storage = new FakeStorage();
  for (const id of ["trip-1", "trip-2", "trip-3", "trip-4"]) writeCache(storage, "user-a", id, build());
  const kept = ["trip-1", "trip-2", "trip-3", "trip-4"].filter((id) => readCache(storage, "user-a", id));
  assert.equal(kept.length, CACHE_TRIP_LIMIT, "thirty cached trips is how a phone hits the quota and loses the outbox with it");
  assert.ok(kept.includes("trip-4"), "the trip just written is never the one evicted");
});

test("a cache written by an older version is ignored rather than half-read", () => {
  const storage = new FakeStorage();
  storage.setItem(cacheKey("user-a", "trip-1"), JSON.stringify({ v: 4, userId: "user-a", tripId: "trip-1", state: build() }));
  assert.equal(readCache(storage, "user-a", "trip-1"), null);
  storage.setItem(cacheKey("user-a", "trip-1"), "{oops");
  assert.equal(readCache(storage, "user-a", "trip-1"), null);
  assert.ok(cacheKey("user-a", "trip-1").startsWith(`${CACHE_PREFIX}:`));
});

test("the v4 entry goes, but not before its queue is lifted out of it", () => {
  const storage = new FakeStorage();
  const stranded = newOp("PUT", "/api/purchases/s-9", { actualPriceCents: 6100 }, "op-v4");
  storage.setItem("trail-cache-v4:user-a", JSON.stringify({ v: 4, userId: "user-a", state: build(), outbox: [stranded] }));
  // FIGMA_ADOPTION §4 forbids sweeping `trail-cache-v4:*` blind, and this is why: the
  // entry is a cache, but the queue inside it is a write that never reached the server.
  const adopted = adoptLegacyOutbox(storage, "user-a", []);
  assert.equal(adopted.length, 1);
  assert.equal(readOutbox(storage, "user-a")[0].opId, "op-v4");
  assert.equal(adoptLegacyOutbox(storage, "user-a", adopted).length, 1, "running it twice must not charge the traveller twice");
  writeCache(storage, "user-a", "trip-1", build());
  dropOtherCaches(storage, "user-a");
  assert.equal(storage.getItem("trail-cache-v4:user-a"), null);
  assert.equal(readOutbox(storage, "user-a").length, 1, "the queue survives the sweep that drops the entry it was in");
  assert.ok(readCache(storage, "user-a", "trip-1"));
});

// ── outbox ───────────────────────────────────────────────────
test("a 409 is a decision, not a hiccup: the op is dropped, never retried", () => {
  assert.equal(classify(409), "drop");
  assert.equal(classify(422), "drop");
  assert.equal(classify(200), "done");
  assert.equal(classify(500), "retry");
  assert.equal(classify(0), "retry", "offline");
  assert.equal(classify(429), "retry");
  assert.equal(classify(500, 5), "drop", "a write that keeps failing is surfaced, not queued forever");
});

test("a repeated purchase for the same stop replaces the queued one", () => {
  const first = newOp("PUT", "/api/purchases/s-1", { actualPriceCents: 100 }, "op-1");
  const second = newOp("PUT", "/api/purchases/s-1", { actualPriceCents: 200 }, "op-2");
  const other = newOp("PUT", "/api/purchases/s-2", { actualPriceCents: 300 }, "op-3");
  const queue = enqueue(enqueue(enqueue([], first), other), second);
  assert.deepEqual(queue.map((o) => o.opId), ["op-3", "op-2"]);
});

test("flush keeps order: the ops behind a retry are not sent out of turn", async () => {
  const queue = [newOp("PUT", "/a", {}, "1"), newOp("PUT", "/b", {}, "2"), newOp("PUT", "/c", {}, "3")];
  const sent: string[] = [];
  const outcome = await flush(queue, async (op) => { sent.push(op.opId); return { status: op.opId === "2" ? 503 : 200 }; });
  assert.deepEqual(sent, ["1", "2"]);
  assert.deepEqual(outcome.done.map((o) => o.opId), ["1"]);
  assert.deepEqual(outcome.pending.map((o) => o.opId), ["2", "3"]);
  assert.equal(outcome.pending[0].tries, 1);
});

test("a refused write is reported back with its status so the traveler is told", async () => {
  const outcome = await flush([newOp("PUT", "/api/purchases/s-1", {}, "1")], async () => ({ status: 409, body: { error: "stale_planned_overwrite" } }));
  assert.deepEqual(outcome.pending, []);
  assert.equal(outcome.dropped[0].status, 409);
  assert.deepEqual(outcome.dropped[0].body, { error: "stale_planned_overwrite" });
});
