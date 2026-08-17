import assert from "node:assert/strict";
import test from "node:test";
import { shapeBudgetSnapshot, shapeState } from "../lib/state/shape.ts";
import type { TripRow } from "../lib/state/rows.ts";

// What `GET /api/state` now hands the screens: recipients in creation order with
// the live plan's allocation joined on, and the approval trail beside them.

const recipientRow = (id: string, name: string, createdAt: string, over = {}) => ({ id, name, relationship: "", group_size: 1, priority: 3, is_self: false, is_optional: false, preference_note: "", equal_value_group: null, created_at: createdAt, ...over });

const changeRow = (id: string, status: "proposed" | "approved" | "rejected", createdAt: string, over = {}) => ({
  id, plan_id: "plan-1", proposed_by: "ai_patch" as const, reason: "Allocations exceed the shopping bucket", status, decided_at: null, created_at: createdAt,
  before_state: { kind: "allocation_overrun", plan: { totalCents: 25000, plannedCents: 21000, deliveryReserveCents: 900, flexibleCents: 3100 }, allocations: [] },
  after_state: { kind: "allocation_overrun", plan: { totalCents: 25000, plannedCents: 23000, deliveryReserveCents: 900, flexibleCents: 1100 }, allocations: [{ recipientId: "rec-1", amountCents: 23000, bucket: "planned" }] },
  ...over,
});

const planRow = (over = {}) => ({ id: "plan-1", status: "draft" as const, version: 1, total_cents: 25000, planned_cents: 21000, delivery_reserve_cents: 900, flexible_cents: 3100, category: "Home & design", preference: "Thoughtful and useful", local_only: true, easy_pack: true, hotel_delivery: true, approved_at: null, updated_at: "2026-08-14T09:02:11+00:00", plan_allocations: [{ recipient_id: "rec-2", amount_cents: 6800, bucket: "planned" as const }], budget_changes: [changeRow("bc-1", "proposed", "2026-08-15T10:00:00+00:00")], ...over });

const tripRow = (over: Partial<TripRow> = {}): TripRow => ({ id: "trip-1", status: "active", country: "Canada", city: "Toronto", areas: [], start_date: null, end_date: null, hotel_name: "", hotel_address: "", hotel_verified_at: null, companions: "", free_time: "", currency: "CAD", updated_at: "2026-08-15T18:19:55.402+00:00", plans: [planRow()], recipients: [recipientRow("rec-2", "friend A", "2026-08-14T09:00:02+00:00"), recipientRow("rec-1", "Mom", "2026-08-14T09:00:01+00:00")], stops: [], unplanned_purchases: [], bag_transfers: [], ...over } as TripRow);

const build = (over: Partial<TripRow> = {}) => shapeState({ user: null, userId: "u-1", email: "traveler@example.com", trip: tripRow(over), list: [], serverTime: "2026-08-15T18:22:04.113Z" });

test("recipients come back in creation order, which is what r1/r2 mean", () => {
  assert.deepEqual(build().recipients.map((r) => r.name), ["Mom", "friend A"]);
});

test("a recipient carries the live plan's allocation, and unallocated is null rather than zero", () => {
  const state = build();
  assert.equal(state.recipients.find((r) => r.name === "friend A")?.allocationCents, 6800);
  assert.equal(state.recipients.find((r) => r.name === "Mom")?.allocationCents, null);
});

test("the wallet reports what is allocated as well as what is left", () => {
  const wallet = build().wallet;
  assert.equal(wallet.allocatedCents, 6800);
  assert.equal(wallet.unallocatedCents, 21000 - 6800);
  assert.equal(wallet.spendableCents, 21000, "the reserve and the flexible bucket are still not spendable");
});

test("a proposal waiting for a tap is surfaced on its own, newest first", () => {
  const state = build({ plans: [planRow({ budget_changes: [changeRow("bc-1", "rejected", "2026-08-15T10:00:00+00:00"), changeRow("bc-2", "proposed", "2026-08-15T12:00:00+00:00")] })] } as Partial<TripRow>);
  assert.deepEqual(state.budgetChanges.map((c) => c.id), ["bc-2", "bc-1"]);
  assert.equal(state.pendingBudgetChange?.id, "bc-2");
  assert.equal(state.pendingBudgetChange?.kind, "allocation_overrun");
  assert.equal(state.pendingBudgetChange?.after?.plan.plannedCents, 23000);
});

test("an approved trail is still readable, and nothing is pending", () => {
  const state = build({ plans: [planRow({ budget_changes: [changeRow("bc-1", "approved", "2026-08-15T10:00:00+00:00", { decided_at: "2026-08-15T10:01:00+00:00" })] })] } as Partial<TripRow>);
  assert.equal(state.pendingBudgetChange, null);
  assert.equal(state.budgetChanges[0].decidedAt, "2026-08-15T10:01:00+00:00");
});

test("a hand-written snapshot reads back as null instead of driving a screen", () => {
  // RLS lets a traveller insert their own budget_changes row. The shape refuses it.
  assert.equal(shapeBudgetSnapshot({ kind: "free_money", plan: { totalCents: 1, plannedCents: 1, deliveryReserveCents: 0, flexibleCents: 0 } }), null);
  assert.equal(shapeBudgetSnapshot({ kind: "bucket_move", plan: { totalCents: -1, plannedCents: 0, deliveryReserveCents: 0, flexibleCents: 0 } }), null);
  const state = build({ plans: [planRow({ budget_changes: [changeRow("bc-1", "proposed", "2026-08-15T10:00:00+00:00", { after_state: { nonsense: true } })] })] } as Partial<TripRow>);
  assert.equal(state.pendingBudgetChange?.after, null);
});

test("a trip with no plan still answers with the new fields", () => {
  const state = build({ plans: [] } as Partial<TripRow>);
  assert.deepEqual(state.budgetChanges, []);
  assert.equal(state.pendingBudgetChange, null);
  assert.equal(state.wallet.allocatedCents, 0);
  assert.equal(state.recipients[0].allocationCents, null);
});
