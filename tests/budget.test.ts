import assert from "node:assert/strict";
import test from "node:test";
import { splitBudget, DELIVERY_RESERVE, QUOTE_BAGS } from "../app/onboarding/budget.ts";
import { quoteFee } from "../lib/transfers/clock.ts";

// plans has a CHECK constraint that the three buckets equal the total, so a
// split that does not add up fails the insert rather than showing wrong numbers.
test("the three buckets always add up to the total", () => {
  for (let total = 40; total <= 1000; total += 10) {
    const { planned, reserve, flexible, total: sum } = splitBudget(total);
    assert.equal(planned + reserve + flexible, sum, `total ${total}`);
    assert.ok(planned >= 0 && reserve >= 0 && flexible >= 0, `total ${total} has a negative bucket`);
  }
});

test("the delivery fee is protected before anything is spendable", () => {
  assert.equal(splitBudget(250).reserve, DELIVERY_RESERVE);
  assert.equal(splitBudget(40).reserve, DELIVERY_RESERVE);
});

/** The bug this file exists to keep out: onboarding held back CAD 9, the app
 *  state charged CAD 9, the dashboard advertised CAD 12 and `delivery_pricing`
 *  billed CAD 15 — so a CAD 100 traveler was six dollars short at the counter.
 *  There is one source now, and this is the assertion that says so. */
test("the reserve is the delivery quote, not a number of its own", () => {
  assert.equal(DELIVERY_RESERVE, quoteFee(null, QUOTE_BAGS).feeCents / 100);
  for (const total of [40, 100, 250, 1000]) assert.ok(splitBudget(total).reserve * 100 >= quoteFee(null, QUOTE_BAGS).feeCents, `a ${total} budget cannot pay the quoted fee`);
});

test("a city with its own price list overrides the fallback", () => {
  const local = splitBudget(250, 24);
  assert.equal(local.reserve, 24);
  assert.equal(local.planned + local.reserve + local.flexible, local.total);
});

test("matches the wallet in the design", () => {
  assert.deepEqual(splitBudget(250), { total: 250, planned: 200, reserve: 15, flexible: 35 });
});

test("a tiny budget still leaves something to spend", () => {
  const small = splitBudget(20);
  assert.ok(small.planned >= 10);
  assert.equal(small.planned + small.reserve + small.flexible, small.total);
});
