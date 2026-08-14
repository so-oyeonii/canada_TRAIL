import assert from "node:assert/strict";
import test from "node:test";
import { NEVER_IMPORTED, droppedFields, parseLegacyBlob, planImport } from "../lib/state/legacy-import.ts";
import { legacyAlternativeTemplates, legacyPriceCents, legacyProductTemplates } from "../lib/legacy/v3-templates.ts";

const blob = (over: Record<string, unknown> = {}) => JSON.stringify({
  trip: { country: "Canada", city: "Toronto", areas: ["Kensington Market", "Queen West"], startDate: "2026-08-12", endDate: "2026-08-16", hotel: "The Annex Hotel", hotelAddress: "296 Brunswick Ave", companions: "Solo trip", freeTime: "3 hours" },
  plan: { recipient: "My mom", quantity: 1, category: "Home & design", budget: 250, preference: "Thoughtful and useful", localOnly: true, easyPack: true, hotelDelivery: true },
  approvedPlan: null,
  purchases: { "0": { status: "bought", actualPrice: 132.5, quantity: 1, bags: 2, handling: "Fragile" } },
  shoppingStarted: true,
  transferStatus: "completed",
  deliveryStep: 3,
  replacementIds: { "1": true },
  savedStops: { "2": true },
  memoryEnabled: true,
  ...over,
});

test("a blob that is not a readable trip is rejected rather than half-imported", () => {
  assert.equal(parseLegacyBlob("not json"), null);
  assert.equal(parseLegacyBlob("[]"), null);
  assert.equal(parseLegacyBlob(JSON.stringify({ plan: { budget: 80 } })), null);
  assert.equal(parseLegacyBlob(JSON.stringify({ trip: { city: "   " } })), null);
  assert.ok(parseLegacyBlob(blob()));
});

test("the three forbidden fields never reach the rows that get written", () => {
  const built = planImport(parseLegacyBlob(blob())!);
  const serialized = JSON.stringify(built.trip) + JSON.stringify(built.plan) + JSON.stringify(built.stops);
  for (const field of NEVER_IMPORTED) assert.ok(!serialized.includes(field), `${field} leaked into the import`);
  // deliveryStep 3 + transferStatus 'completed' claimed a hotel handoff. The
  // import produces no transfer and no custody event at all, so the ledger for
  // this account starts empty rather than starting false.
  assert.deepEqual(Object.keys(built).sort(), ["dropped", "plan", "stops", "trip"]);
});

test("a device that held the forbidden fields is told, not silently trimmed", () => {
  assert.deepEqual(droppedFields(parseLegacyBlob(blob())!).sort(), ["deliveryStep", "memoryEnabled", "shoppingStarted", "transferStatus"]);
  assert.deepEqual(droppedFields(parseLegacyBlob(blob({ deliveryStep: undefined, transferStatus: undefined, memoryEnabled: undefined, shoppingStarted: undefined }))!), []);
});

test("memoryEnabled true on the device does not become consent on the account", () => {
  const built = planImport(parseLegacyBlob(blob({ memoryEnabled: true }))!);
  assert.equal(Object.prototype.hasOwnProperty.call(built.plan, "memoryEnabled"), false);
  assert.equal((built.trip as Record<string, unknown>).memoryEnabled, undefined);
});

test("money survives: a bought purchase keeps its exact amount in cents", () => {
  const built = planImport(parseLegacyBlob(blob())!);
  assert.equal(built.stops[0].status, "bought");
  assert.equal(built.stops[0].purchase?.actualPriceCents, 13250);
  assert.equal(built.stops[0].purchase?.bags, 2);
  assert.equal(built.stops[1].purchase, null);
});

test("the price the traveler saw is frozen, not recomputed from the budget", () => {
  const built = planImport(parseLegacyBlob(blob())!);
  assert.deepEqual(built.stops.map((s) => s.snapshotPriceCents), [12000, 7800, 5300]);
  // same blob, a budget the traveler lowered afterwards, would not change these
  assert.equal(legacyPriceCents(250, 0), 12000);
  assert.notEqual(legacyPriceCents(80, 0), legacyPriceCents(250, 0));
});

test("a replaced stop imports as the alternative, and the original is not invented", () => {
  const built = planImport(parseLegacyBlob(blob())!);
  assert.equal(built.stops[1].productName, legacyAlternativeTemplates[1].name);
  assert.equal(built.stops[1].fromAlternative, true);
  assert.equal(built.stops[0].productName, legacyProductTemplates[0].name);
  assert.equal(built.stops[0].fromAlternative, false);
  assert.equal(built.stops.length, 3, "a replacement adds no extra row");
});

test("savedStops becomes a column on the right stop, not a shifted index", () => {
  const built = planImport(parseLegacyBlob(blob())!);
  assert.deepEqual(built.stops.map((s) => s.saved), [false, false, true]);
});

test("an approved plan keeps its approval, a draft does not gain one", () => {
  const approved = planImport(parseLegacyBlob(blob({ approvedPlan: { budget: 250, category: "Home & design" } }))!, "2026-08-15T00:00:00.000Z");
  assert.equal(approved.plan.status, "approved");
  assert.equal(approved.plan.approvedAt, "2026-08-15T00:00:00.000Z");
  const draft = planImport(parseLegacyBlob(blob())!);
  assert.equal(draft.plan.status, "draft");
  assert.equal(draft.plan.approvedAt, null);
});

test("the three buckets add up, in cents, so the plans CHECK constraint passes", () => {
  for (const budget of [0, 20, 80, 250, 999]) {
    const { plan } = planImport(parseLegacyBlob(blob({ plan: { budget } }))!);
    assert.equal(plan.plannedCents + plan.deliveryReserveCents + plan.flexibleCents, plan.totalCents, `budget ${budget}`);
  }
});

test("junk values are clamped instead of reaching a NOT NULL or CHECK column", () => {
  const built = planImport(parseLegacyBlob(blob({ purchases: { "0": { status: "bought", actualPrice: -5, quantity: 0, bags: "many", handling: "Radioactive" } }, plan: { budget: "lots" } }))!);
  assert.equal(built.stops[0].purchase?.actualPriceCents, 0);
  assert.equal(built.stops[0].purchase?.quantity, 1);
  assert.equal(built.stops[0].purchase?.bags, 1);
  assert.equal(built.stops[0].purchase?.handling, "Fragile");
  assert.equal(built.plan.totalCents >= 0, true);
});

test("an unknown stop status falls back to planned rather than dropping the row", () => {
  const built = planImport(parseLegacyBlob(blob({ purchases: { "0": { status: "refunded" } } }))!);
  assert.equal(built.stops[0].status, "planned");
  assert.equal(built.stops[0].purchase, null);
});
