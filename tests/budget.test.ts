import assert from "node:assert/strict";
import test from "node:test";
import { splitBudget, DELIVERY_RESERVE } from "../app/onboarding/budget.ts";

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

test("matches the wallet in the design", () => {
  assert.deepEqual(splitBudget(250), { total: 250, planned: 210, reserve: 9, flexible: 31 });
});

test("a tiny budget still leaves something to spend", () => {
  const small = splitBudget(20);
  assert.ok(small.planned >= 10);
  assert.equal(small.planned + small.reserve + small.flexible, small.total);
});
