import assert from "node:assert/strict";
import test from "node:test";
import { parseBudgetChange, planPatch, readState, reserveLocked, sameBuckets, validateAfterState, type BudgetState, type PlanBuckets } from "../lib/budget/changes.ts";

// A wallet of $250: $210 to shop with, $15 held for the delivery, $25 flexible.
// Every case is a way money moves without the traveller having agreed to it.

const PLAN: PlanBuckets = { totalCents: 25000, plannedCents: 21000, deliveryReserveCents: 1500, flexibleCents: 2500 };
const before = (over: Partial<BudgetState> = {}): BudgetState => ({ kind: "bucket_move", plan: PLAN, allocations: [], ...over });
const propose = (body: Record<string, unknown>, state = before()) => parseBudgetChange({ kind: "bucket_move", reason: "Move flexible into shopping", ...body }, state);

test("moving flexible into planned keeps the total and passes", () => {
  const parsed = propose({ plan: { plannedCents: 23000, flexibleCents: 500 } });
  assert.ok(parsed.ok);
  assert.equal(parsed.value.after.plan.totalCents, 25000);
  assert.deepEqual(planPatch(parsed.value.after.plan), { total_cents: 25000, planned_cents: 23000, delivery_reserve_cents: 1500, flexible_cents: 500 });
});

test("a bucket move that grows the total is refused rather than rebalanced", () => {
  const parsed = propose({ plan: { plannedCents: 23000 } });   // flexible untouched, so the sum grows
  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok === false ? parsed.reason : "", "total_changed");
});

test("a top-up says so, and then the bigger total is allowed", () => {
  const parsed = propose({ kind: "total_change", reason: "Adding $20", plan: { plannedCents: 23000 } });
  assert.ok(parsed.ok);
  assert.equal(parsed.value.after.plan.totalCents, 27000);
});

test("a stated total that does not equal its parts is a 400, never quietly fixed", () => {
  const parsed = propose({ plan: { plannedCents: 23000, flexibleCents: 500, totalCents: 26000 } });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok === false ? parsed.reason : "", "buckets_do_not_sum");
});

test("a proposal that allocates more than the shopping bucket it proposes is refused", () => {
  const parsed = propose({ plan: { plannedCents: 23000, flexibleCents: 500 }, allocations: [{ recipientId: "a", amountCents: 24000 }] });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok === false ? parsed.reason : "", "allocations_exceed_planned");
});

test("an approval that changes nothing is not an approval", () => {
  assert.equal(propose({ plan: {} }).ok, false);
});

test("a reason is required: an unexplained budget move is not reviewable later", () => {
  assert.equal(parseBudgetChange({ kind: "bucket_move", plan: { plannedCents: 23000, flexibleCents: 500 } }, before()).ok, false);
});

test("the model may propose but the proposer is never `approval`", () => {
  assert.equal(propose({ plan: { plannedCents: 23000, flexibleCents: 500 }, proposedBy: "ai_patch" }).ok, true);
  assert.equal(propose({ plan: { plannedCents: 23000, flexibleCents: 500 }, proposedBy: "approval" }).ok, false);
});

test("the delivery reserve cannot be drained under a transfer that is already moving", () => {
  const after = { ...PLAN, plannedCents: 22000, deliveryReserveCents: 500 };
  assert.equal(reserveLocked(PLAN, after, 1500), true, "a $15 transfer is open and the reserve would drop to $5");
  assert.equal(reserveLocked(PLAN, after, null), false, "with nothing in transit the same move is fine");
  assert.equal(reserveLocked(PLAN, { ...PLAN, deliveryReserveCents: 2000, flexibleCents: 2000 }, 1500), false, "growing it is always allowed");
});

test("a proposal is re-validated on approval, because RLS lets a row in by the side door", () => {
  const handWritten: BudgetState = { kind: "bucket_move", plan: { totalCents: 99000, plannedCents: 99000, deliveryReserveCents: 0, flexibleCents: 0 }, allocations: null };
  assert.equal(validateAfterState(before(), handWritten)?.reason, "total_changed");
});

test("a snapshot that is not the shape this app writes reads back as null", () => {
  assert.equal(readState({ kind: "bucket_move", plan: { totalCents: "lots" } }), null);
  assert.equal(readState({ plan: PLAN }), null);
  assert.equal(readState(null), null);
  assert.deepEqual(readState({ kind: "bucket_move", plan: PLAN, allocations: [] })?.plan, PLAN);
});

test("sameBuckets is what catches a plan that moved under a pending proposal", () => {
  assert.equal(sameBuckets(PLAN, { ...PLAN }), true);
  assert.equal(sameBuckets(PLAN, { ...PLAN, plannedCents: 21001, flexibleCents: 2499 }), false);
});

test("an omitted bucket keeps what the plan has today", () => {
  const parsed = propose({ kind: "total_change", reason: "top up", plan: { flexibleCents: 5000 } });
  assert.ok(parsed.ok);
  assert.equal(parsed.value.after.plan.plannedCents, 21000);
  assert.equal(parsed.value.after.plan.deliveryReserveCents, 1500);
});

test("a client op id makes the second tap in a basement the same proposal", () => {
  assert.equal(propose({ plan: { plannedCents: 23000, flexibleCents: 500 }, clientOpId: "op-7" }).ok && true, true);
  assert.equal(propose({ plan: { plannedCents: 23000, flexibleCents: 500 }, clientOpId: {} }).ok, false);
});

test("negative money is not a budget move", () => {
  assert.equal(propose({ plan: { plannedCents: -100, flexibleCents: 23600 } }).ok, false);
});
