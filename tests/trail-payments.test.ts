import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The simulated charge used to answer `{status: "captured"}` and write nothing.
// The hotel receipt's `payment_id` was therefore always null, a cancelled
// delivery had a refund with nothing to refund, and the transfer sat at
// "waiting for payment" after the traveler had paid.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/payments/simulate/route.ts");
const events = read("app/api/transfers/[id]/events/route.ts");
const screen = read("app/(app)/bags/pay/page.tsx");

test("the amount charged is the fee frozen on the transfer, never the client's", () => {
  assert.ok(!/body\.body\.amountCents/.test(route), "the charge must not be read from the body");
  assert.match(route, /const amountCents = transfer\.fee_cents/);
  assert.ok(!/amountCents:/.test(screen.slice(screen.indexOf("/api/payments/simulate"), screen.indexOf("/api/payments/simulate") + 400)), "the pay screen must not send an amount");
  assert.match(screen, /transferId: transfer\.id/);
});

test("a payment cannot be recorded for a delivery nobody confirmed or already closed", () => {
  assert.match(route, /if \(!transfer\.confirmed_at\) return json\(\{ error: "not_confirmed"/);
  assert.match(route, /TERMINAL\.includes\(transfer\.status\)/);
});

test("the row goes in with the service key, or not at all", () => {
  assert.match(route, /const admin = adminOrNull\(\)/);
  assert.match(route, /error: "payment_unavailable"[\s\S]*?503/);
  assert.ok(/admin\.from\("payments"\)\.insert/.test(route), "payments has no INSERT grant for authenticated");
  assert.ok(!/db\.from\("payments"\)\.insert/.test(route), "a client-writable payment row is a self-marked delivery");
});

test("a capture writes the paid event, because status comes from the ledger", () => {
  assert.match(route, /insertEvent\(admin, \{ transferId, userId: uid, eventType: "paid"/);
  assert.ok(!/from\("bag_transfers"\)[\s\S]{0,80}status:/.test(route), "0012: no route writes a transfer status");
});

test("a declined card is still recorded, and a second tap does not charge twice", () => {
  assert.match(route, /status: "failed", failure_code: failureCode/);
  assert.match(route, /replayed: true/);
  assert.ok(/eq\("status", "captured"\)/.test(route), "the replay check must look for a capture, not any row");
});

test("cancelling a paid delivery refunds it instead of only saying so", () => {
  assert.match(events, /status: "refunded", refunded_at/);
  assert.ok(/!written\.duplicate/.test(events), "a replayed cancellation must not refund a second time");
  assert.ok(/refunded \}/.test(events), "the screen has to be told whether the refund actually landed");
  assert.ok(/adminOrNull\(\)/.test(events), "payments is read-only to the client");
});
