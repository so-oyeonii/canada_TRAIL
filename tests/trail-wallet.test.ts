import assert from "node:assert/strict";
import test from "node:test";
import { briefContext, composeTurn, sanitizePatch, sanitizeWalletPatch, splitBuckets, DELIVERY_RESERVE_CENTS, SYSTEM_PROMPT, type TurnContext } from "../app/trail-brief.ts";

// The traveler says one number. The app owns every number that follows from it.
// These cases pin the two ways that used to go wrong: reading an unscoped total as gifts-only,
// and letting the slider's ten-dollar snap escape into money the traveler typed exactly.

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({ trip: { city: "Toronto", country: "Canada", areas: ["Kensington Market"], currency: "CAD" }, recipients: [], ...over });
const turn = (wallet: unknown, over: Partial<TurnContext> = {}) => composeTurn({ reply: "Noted.", wallet_patch: wallet }, ctx(over));

test("an unscoped total writes nothing at all and becomes a question", () => {
  // "My budget is 250" used to become 250 dollars of gifts. The traveler then found out at the
  // partner counter that the transfer was never covered.
  const { wallet, rejected } = sanitizeWalletPatch({ scope: "unclear", total_amount: 250, currency: null }, ctx());
  assert.equal(wallet, null);
  assert.equal(rejected[0]?.reason, "ambiguous_scope");
  assert.equal(turn({ scope: "unclear", total_amount: 250, currency: null }).patch.budget, undefined);
});

test("a missing scope is treated exactly like an unclear one", () => {
  assert.equal(sanitizeWalletPatch({ total_amount: 250 }, ctx()).rejected[0]?.reason, "ambiguous_scope");
});

test("gifts-only means the trip total grows past the number they said", () => {
  const buckets = splitBuckets(25000, "gifts_only", 900);
  assert.deepEqual(buckets, { totalCents: 28400, plannedCents: 25000, deliveryReserveCents: 900, flexibleCents: 2500 });
});

test("trip-total means the shoppable amount shrinks below the number they said", () => {
  const buckets = splitBuckets(25000, "trip_total", 900);
  assert.deepEqual(buckets, { totalCents: 25000, plannedCents: 21690, deliveryReserveCents: 900, flexibleCents: 2410 });
});

test("the two scopes never produce the same shoppable amount", () => {
  // If this ever passes by equality, the whole scope question has stopped meaning anything.
  assert.notEqual(splitBuckets(25000, "gifts_only", 900).plannedCents, splitBuckets(25000, "trip_total", 900).plannedCents);
});

test("the hold-back can change size without changing one token of the model's input", () => {
  const before = SYSTEM_PROMPT + briefContext(ctx({ plannedUnits: 250, unallocatedUnits: 34 }));
  assert.equal(before.includes(`${DELIVERY_RESERVE_CENTS}`), false);
  assert.equal(before.includes(`${DELIVERY_RESERVE_CENTS / 100}`), false);
  assert.equal(/reserve|held back|hold-back/i.test(briefContext(ctx({ plannedUnits: 250 }))), false);
  // splitBuckets is the only thing that reads it, and it takes it as an argument.
  assert.notDeepEqual(splitBuckets(25000, "trip_total", 900), splitBuckets(25000, "trip_total", 1500));
});

test("a reply that mentions the hold-back is replaced instead of shown", () => {
  const reply = turn({ scope: "gifts_only", total_amount: 250, currency: null });
  assert.equal(reply.wallet?.totalCents, 25000);
  const leaked = composeTurn({ reply: "I've kept $9 held back for the delivery fee.", wallet_patch: null }, ctx());
  assert.equal(leaked.errorCode, "reserve_leak");
  assert.equal(leaked.reply.includes("9"), false);
});

test("an out-of-range total is rejected, never clamped", () => {
  const { wallet, rejected } = sanitizeWalletPatch({ scope: "gifts_only", total_amount: 5_000_000 }, ctx());
  assert.equal(wallet, null);
  assert.equal(rejected[0]?.reason, "out_of_range");
  assert.equal(sanitizeWalletPatch({ scope: "gifts_only", total_amount: 19 }, ctx()).wallet, null);
});

test("the ten-dollar snap stays on the slider and never touches money that was typed", () => {
  // 58 / 68 / 39 / 45 would become 60 / 70 / 40 / 50 and the total would drift by 11.
  const figma = [58, 68, 39, 45];
  const ops = composeTurn({ reply: "ok", recipients: figma.map((amount, index) => ({ op: "update", ref: `r${index + 1}`, allocation_amount: amount })) }, ctx({ recipients: figma.map((_, index) => ({ ref: `r${index + 1}`, label: `person ${index + 1}` })), plannedUnits: 400 }));
  assert.deepEqual(ops.recipientOps.map((op) => op.fields.allocationAmount), figma);
  assert.equal(ops.recipientOps.reduce((sum, op) => sum + (op.fields.allocationAmount ?? 0), 0), 210);
  // The legacy slider field still snaps, because that field really does move in tens.
  assert.equal(sanitizePatch({ budget: 84 }).patch.budget, 80);
  assert.equal(turn({ scope: "gifts_only", total_amount: 254, currency: null }).wallet?.totalCents, 25400);
});

test("a currency change needs a tap, and is refused once a purchase exists", () => {
  const proposed = sanitizeWalletPatch({ scope: "gifts_only", total_amount: 250, currency: "USD" }, ctx());
  assert.equal(proposed.wallet, null);
  assert.equal(proposed.confirm?.currency, "USD");
  const locked = sanitizeWalletPatch({ scope: "gifts_only", total_amount: 250, currency: "USD" }, ctx({ hasPurchases: true }));
  assert.equal(locked.confirm, null);
  assert.equal(locked.rejected[0]?.reason, "currency_locked");
});

test("a yen total is not multiplied by a hundred", () => {
  const jpy = sanitizeWalletPatch({ scope: "trip_total", total_amount: 30000 }, ctx({ trip: { city: "Tokyo", country: "Japan", currency: "JPY" } }));
  assert.equal(jpy.wallet?.totalCents, 30000);
  assert.equal(jpy.wallet?.currency, "JPY");
});

test("clearing the budget drops the draft total and nothing else", () => {
  const reply = composeTurn({ reply: "Let's start the budget again.", clear: ["budget"] }, ctx());
  assert.deepEqual(reply.clear, ["budget"]);
  assert.equal(reply.wallet, null);
  assert.deepEqual(reply.recipientOps, []);
  // A total that arrives in the same turn wins over the clear: no setting and erasing in one breath.
  assert.deepEqual(composeTurn({ reply: "ok", wallet_patch: { scope: "gifts_only", total_amount: 250 }, clear: ["budget"] }, ctx()).clear, []);
});
