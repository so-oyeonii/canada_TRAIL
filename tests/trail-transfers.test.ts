import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bagCountOf, parseManifest, planManifest, weightOf, type ManifestInput } from "../lib/transfers/manifest.ts";
import { STATUS_AFTER, TRAVELER_EVENTS, compareSeals, nextSimulatedEvent, projectStatus, statusAfter, travelerEventVerdict } from "../lib/transfers/custody.ts";
import { judgeEligibility, type EligibilityInput } from "../lib/transfers/eligibility.ts";
import { chilledDeadline, cutoffInstant, dayInZone, etaWindow, isOpenNow, minutesUntil, pickPricing, quoteFee, zonedInstant } from "../lib/transfers/clock.ts";
import { constantTimeEqual, issuePass, issueScanSession, passExpirySeconds, sha256Hex, verifyPass } from "../lib/transfers/pass.ts";

const PURCHASE_A = "aaaaaaaa-1111-4111-8111-111111111111";
const PURCHASE_B = "bbbbbbbb-2222-4222-8222-222222222222";
const ITEM_A = "cccccccc-3333-4333-8333-333333333333";
const TRANSFER = "dddddddd-4444-4444-8444-444444444444";
const SECRET = "test-signing-key-not-the-real-one";
const NOW = new Date("2026-08-15T19:00:00.000Z");

const parse = (items: unknown[]): ManifestInput[] => { const out = parseManifest(items); assert.ok(out.ok, `parse failed: ${out.ok ? "" : out.field}`); return out.items; };

// ── the manifest ─────────────────────────────────────────────

test("a bag with no purchase and no label is refused, not stored as an empty row", () => {
  const out = parseManifest([{ bags: 1 }]);
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.field, "items[].label");
});

test("a bag bought outside the plan needs only a label", () => {
  const items = parse([{ label: "Chocolate from the market", bags: 2, handling: "Chilled" }]);
  assert.equal(items[0].purchaseId, null);
  assert.equal(items[0].bags, 2);
  assert.equal(items[0].handling, "Chilled");
});

test("a local: key is a bag the server has never seen, not a purchase id", () => {
  const items = parse([{ key: `local:${ITEM_A}`, label: "Tote" }]);
  assert.equal(items[0].purchaseId, null, "local:<uuid> must never be read as a purchase");
});

test("the same purchase twice is one bag entered twice", () => {
  const out = parseManifest([{ purchaseId: PURCHASE_A }, { purchaseId: PURCHASE_A }]);
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.field, "items[].purchaseId");
});

test("junk in a field is a named 400, never a coerced value", () => {
  for (const [entry, field] of [[{ purchaseId: "not-a-uuid" }, "items[].purchaseId"], [{ label: "x", bags: 0 }, "items[].bags"], [{ label: "x", bags: 1.5 }, "items[].bags"], [{ label: "x", handling: "Frozen" }, "items[].handling"], [{ label: "x", weightGrams: -1 }, "items[].weightGrams"], [{ label: "x", weightGrams: "heavy" }, "items[].weightGrams"]] as [Record<string, unknown>, string][]) {
    const out = parseManifest([entry]);
    assert.equal(out.ok, false, `${JSON.stringify(entry)} should not parse`);
    assert.equal(out.ok === false && out.field, field);
  }
  assert.equal(parseManifest({ nope: true }).ok, false);
  assert.equal(parseManifest(Array.from({ length: 41 }, () => ({ label: "x" }))).ok, false, "a 41-bag manifest is a bug, not a delivery");
});

test("a control character in a label never reaches the row", () => {
  const noisy = String.fromCharCode(7) + "Tote bag" + String.fromCharCode(10);
  assert.equal(parse([{ label: noisy }])[0].label, "Tote bag");
});

test("bags are counted, and weight stays null until somebody actually weighs one", () => {
  const items = parse([{ label: "a", bags: 2 }, { label: "b", bags: 3 }]);
  assert.equal(bagCountOf(items), 5);
  assert.equal(weightOf(items), null, "0 g would claim the traveler weighed them");
  assert.equal(weightOf(parse([{ label: "a", weightGrams: 1200 }, { label: "b" }])), 1200);
});

// ── replaying the manifest ───────────────────────────────────

test("replaying the same manifest changes nothing", () => {
  const existing = [{ id: ITEM_A, purchase_id: PURCHASE_A, label: "Blue Banana" }, { id: TRANSFER, purchase_id: null, label: "Tote" }];
  const plan = planManifest(existing, parse([{ purchaseId: PURCHASE_A, label: "Blue Banana" }, { label: "Tote" }]));
  assert.deepEqual(plan.insert, [], "a replay must not double the manifest");
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.update.length, 2);
});

test("two loose bags with the same label stay two bags across a replay", () => {
  const existing = [{ id: ITEM_A, purchase_id: null, label: "Bag" }, { id: TRANSFER, purchase_id: null, label: "Bag" }];
  const plan = planManifest(existing, parse([{ label: "Bag" }, { label: "Bag" }]));
  assert.deepEqual(plan.insert, []);
  assert.deepEqual(plan.remove, []);
  assert.equal(new Set(plan.update.map((u) => u.id)).size, 2, "the two bags matched two different rows");
});

test("a bag taken off the manifest is removed, and a new one is inserted", () => {
  const existing = [{ id: ITEM_A, purchase_id: PURCHASE_A, label: "Blue Banana" }];
  const plan = planManifest(existing, parse([{ purchaseId: PURCHASE_B, label: "Spacing" }]));
  assert.deepEqual(plan.remove, [ITEM_A]);
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.update.length, 0);
});

test("a row named by id wins over a label that happens to match", () => {
  const existing = [{ id: ITEM_A, purchase_id: null, label: "Tote" }, { id: TRANSFER, purchase_id: null, label: "Tote" }];
  const plan = planManifest(existing, parse([{ id: TRANSFER, label: "Tote" }]));
  assert.deepEqual(plan.update.map((u) => u.id), [TRANSFER]);
  assert.deepEqual(plan.remove, [ITEM_A]);
});

// ── custody is the ledger's answer ───────────────────────────

test("the traveler may claim exactly four things", () => {
  assert.deepEqual([...TRAVELER_EVENTS], ["dropped_off", "delayed", "seal_issue", "cancelled"]);
});

test("the status table matches the trigger that actually writes it", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0012_custody_is_server_owned.sql", import.meta.url), "utf8");
  const body = sql.slice(sql.indexOf("next_status := (case new.event_type"), sql.indexOf("else null end)"));
  const fromSql = new Map<string, string>();
  for (const line of body.split("\n")) { const hit = line.match(/when '(\w+)'\s+then '(\w+)'/); if (hit) fromSql.set(hit[1], hit[2]); }
  assert.ok(fromSql.size >= 9, "the trigger body was not parsed");
  assert.deepEqual(Object.fromEntries([...fromSql].sort()), Object.fromEntries(Object.entries(STATUS_AFTER).sort()), "custody.ts and 0012 disagree about what an event means");
});

test("a partner declining is recoverable, a hotel declining is a failure", () => {
  assert.equal(statusAfter("declined", "partner", "dropped_off"), "dropped_off");
  assert.equal(statusAfter("declined", "hotel", "in_transit"), "failed");
});

test("delivered and cancelled are frozen", () => {
  for (const terminal of ["delivered", "cancelled"] as const) assert.equal(statusAfter("collected", "partner", terminal), terminal);
});

test("the timeline is projected from events, never incremented by a button", () => {
  const status = projectStatus([{ eventType: "bags_selected", actor: "traveler" }, { eventType: "paid", actor: "system" }, { eventType: "dropped_off", actor: "traveler" }, { eventType: "sealed", actor: "partner" }, { eventType: "collected", actor: "partner" }, { eventType: "handed_off", actor: "hotel" }]);
  assert.equal(status, "delivered");
});

test("bags cannot be dropped off for a delivery nobody confirmed", () => {
  const verdict = travelerEventVerdict("dropped_off", "draft");
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.code, "not_confirmed");
});

test("cancelling is free before the bags move, and refused after", () => {
  for (const status of ["draft", "awaiting_payment", "paid"] as const) assert.equal(travelerEventVerdict("cancelled", status).ok, true, status);
  for (const status of ["dropped_off", "in_transit", "failed"] as const) {
    const verdict = travelerEventVerdict("cancelled", status);
    assert.equal(verdict.ok === false && verdict.code, "too_late_to_cancel", status);
  }
});

test("a delivered transfer takes no further claim from the traveler", () => {
  for (const type of TRAVELER_EVENTS) {
    const verdict = travelerEventVerdict(type, "delivered");
    assert.equal(verdict.ok === false && verdict.code, "transfer_closed", type);
  }
});

test("a delay can still be reported after a failed handoff", () => {
  assert.equal(travelerEventVerdict("delayed", "failed").ok, true);
  assert.equal(travelerEventVerdict("seal_issue", "in_transit").ok, true);
});

// ── handoff proof ────────────────────────────────────────────

test("the handoff compares tag ids, not how many bags are on the desk", () => {
  const right = compareSeals(["TRL-A19", "TRL-B22"], ["trl-b22", " TRL-A19 "]);
  assert.equal(right.match, true, "case and whitespace are not the traveler's problem");
  const wrong = compareSeals(["TRL-A19", "TRL-B22"], ["TRL-A19", "TRL-C40"]);
  assert.equal(wrong.match, false);
  assert.deepEqual(wrong.missing, ["TRL-B22"]);
  assert.deepEqual(wrong.extra, ["TRL-C40"], "an extra bag is a different incident from a missing one");
  assert.equal(compareSeals([], []).match, false, "nothing scanned proves nothing");
});

test("the simulated chain never skips a step", () => {
  assert.deepEqual(nextSimulatedEvent("paid", null), { eventType: "collected", actor: "partner" });
  assert.deepEqual(nextSimulatedEvent("dropped_off", "dropped_off"), { eventType: "collected", actor: "partner" });
  assert.deepEqual(nextSimulatedEvent("in_transit", "collected"), { eventType: "in_transit", actor: "driver" });
  assert.deepEqual(nextSimulatedEvent("in_transit", "arrived"), { eventType: "handed_off", actor: "hotel" });
  assert.equal(nextSimulatedEvent("delivered", "handed_off"), null);
  assert.equal(nextSimulatedEvent("draft", null), null, "an unconfirmed delivery has nothing to advance");
});

// ── the clock, the quote, the price list ─────────────────────

test("18:00 at the counter is 18:00 in Toronto, not in UTC", () => {
  const cutoff = cutoffInstant(NOW, "18:00", "America/Toronto");
  assert.equal(cutoff?.toISOString(), "2026-08-15T22:00:00.000Z", "summer time is four hours behind UTC");
  assert.equal(dayInZone(new Date("2026-08-16T02:30:00Z"), "America/Toronto"), "2026-08-15", "after midnight UTC it is still yesterday at the shop");
  assert.equal(zonedInstant("2026-01-15", "18:00", "America/Toronto").toISOString(), "2026-01-15T23:00:00.000Z", "and five in January");
  assert.equal(cutoffInstant(NOW, null, "America/Toronto"), null);
});

test("the eta window is quoted once and hangs off the cutoff", () => {
  const eta = etaWindow(new Date("2026-08-15T22:00:00Z"));
  assert.equal(eta.etaStart, "2026-08-16T00:00:00.000Z");
  assert.equal(eta.etaEnd, "2026-08-16T01:00:00.000Z");
  assert.equal(minutesUntil(new Date("2026-08-15T22:00:00Z"), NOW), 180);
});

test("the fee comes from the price list, and extra bags are counted against it", () => {
  const pricing = { base_cents: 1500, included_bags: 3, extra_bag_cents: 400, currency: "CAD" };
  assert.equal(quoteFee(pricing, 3).feeCents, 1500);
  assert.equal(quoteFee(pricing, 5).feeCents, 2300);
  assert.equal(quoteFee(pricing, 5).extraBags, 2);
  assert.equal(quoteFee(null, 5).feeCents, 2300, "a missing row degrades to the seeded quote, never to a free delivery");
});

test("the price in force is the newest row that has already started", () => {
  const rows = [
    { base_cents: 1500, included_bags: 3, extra_bag_cents: 400, currency: "CAD", effective_from: "2026-01-01T00:00:00Z" },
    { base_cents: 1800, included_bags: 3, extra_bag_cents: 450, currency: "CAD", effective_from: "2026-08-01T00:00:00Z" },
    { base_cents: 9900, included_bags: 1, extra_bag_cents: 900, currency: "CAD", effective_from: "2026-12-01T00:00:00Z" },
  ];
  assert.equal(pickPricing(rows, NOW)?.base_cents, 1800);
  assert.equal(pickPricing(rows, new Date("2026-02-01T00:00:00Z"))?.base_cents, 1500, "a quote given in February is still explainable");
  assert.equal(pickPricing([], NOW), null);
});

test("a counter with no hours for today is closed, not probably open", () => {
  const zone = "America/Toronto";
  const saturday = [{ weekday: 6, opens: "10:00", closes: "19:00" }];
  assert.equal(isOpenNow(new Date("2026-08-15T19:00:00Z"), zone, saturday), true, "15:00 in Toronto on a Saturday");
  assert.equal(isOpenNow(new Date("2026-08-15T22:59:00Z"), zone, saturday), true, "18:59, a minute before the door shuts");
  assert.equal(isOpenNow(new Date("2026-08-16T01:00:00Z"), zone, saturday), false, "21:00 the same evening, two hours after closing");
  assert.equal(isOpenNow(new Date("2026-08-15T05:00:00Z"), zone, saturday), false, "01:00 at the shop");
  assert.equal(isOpenNow(new Date("2026-08-16T19:00:00Z"), zone, saturday), false, "Sunday has no row");
});

// ── the six refusals ─────────────────────────────────────────

const store = { id: "s1", name: "Blue Banana Market", acceptedHandling: ["Standard", "Fragile", "Chilled"] as const, maxWeightGrams: 12000, cutoffAt: "2026-08-15T22:00:00Z", timezone: "America/Toronto" };
const base = (over: Partial<EligibilityInput> = {}): EligibilityInput => ({
  items: [{ handling: "Standard", bags: 2, weightGrams: 3000 }], store: { ...store, acceptedHandling: [...store.acceptedHandling] },
  partnerCount: 3, hotel: { name: "The Annex Hotel", acceptsDelivery: true, verified: true },
  reserveCents: 900, feeCents: 900, now: NOW.toISOString(), ...over,
});

test("a delivery that can happen is not refused for anything", () => {
  const verdict = judgeEligibility(base());
  assert.equal(verdict.eligible, true);
  assert.equal(verdict.code, null);
});

test("each of the six refusals is decided from a row, and carries a remedy", () => {
  const cases: [Partial<EligibilityInput>, string][] = [
    [{ partnerCount: 0 }, "no_partner_nearby"],
    [{ now: "2026-08-15T23:00:00Z" }, "cutoff_passed"],
    [{ items: [{ handling: "Chilled", bags: 1, weightGrams: 500, chilledDeadline: "2026-08-15T18:00:00Z" }] }, "chilled_window_closed"],
    [{ hotel: { name: "Kensington Suites", acceptsDelivery: false, verified: true } }, "hotel_refuses"],
    [{ items: [{ handling: "Heavy", bags: 1, weightGrams: 500 }] }, "handling_unsupported"],
    [{ feeCents: 2300 }, "reserve_short"],
  ];
  for (const [over, code] of cases) {
    const verdict = judgeEligibility(base(over));
    assert.equal(verdict.eligible, false, code);
    assert.equal(verdict.code, code);
    assert.ok(verdict.remedies.length > 0, `${code} left the traveler with nothing to do`);
    assert.ok(verdict.detail.length > 0, `${code} has no explanation`);
  }
});

test("over the weight ceiling is refused before anybody carries it", () => {
  assert.equal(judgeEligibility(base({ items: [{ handling: "Standard", bags: 6, weightGrams: 13000 }] })).code, "handling_unsupported");
});

test("a chilled box is counted from the till, not from when the bags were chosen", () => {
  const deadline = chilledDeadline(new Date("2026-08-15T16:00:00Z"));
  assert.equal(deadline.toISOString(), "2026-08-15T20:00:00.000Z");
  assert.equal(judgeEligibility(base({ items: [{ handling: "Chilled", bags: 1, weightGrams: 500, chilledDeadline: deadline.toISOString() }] })).eligible, true, "an hour left is still eligible");
});

test("no counter chosen and no bags chosen are not refusals with a code", () => {
  assert.equal(judgeEligibility(base({ store: null })).code, null);
  assert.equal(judgeEligibility(base({ items: [] })).code, null);
});

test("the delivery fee never quietly reaches past the reserve", () => {
  const verdict = judgeEligibility(base({ feeCents: 1500, reserveCents: 900 }));
  assert.equal(verdict.code, "reserve_short");
  assert.deepEqual(verdict.remedies, ["approve_flexible"], "the flexible bucket is spent by a tap, not by the server");
});

// ── the pass ─────────────────────────────────────────────────

test("a pass verifies, and one changed character does not", async () => {
  const pass = await issuePass({ transferId: TRANSFER, jti: ITEM_A, issuedAt: NOW, cutoffAt: new Date("2026-08-15T22:00:00Z"), bagCount: 3, secret: SECRET });
  const good = await verifyPass(pass.token, SECRET, NOW, pass.tokenHash);
  assert.equal(good.ok, true);
  assert.equal(good.ok === true && good.payload.t, TRANSFER);

  const tampered = `${pass.token.slice(0, -2)}${pass.token.slice(-2) === "AA" ? "BB" : "AA"}`;
  assert.equal((await verifyPass(tampered, SECRET, NOW, pass.tokenHash)).ok, false);
  assert.equal((await verifyPass(pass.token, "another-key", NOW, pass.tokenHash)).ok, false);
  const forged = await verifyPass(pass.token, "another-key", NOW, pass.tokenHash);
  assert.equal(forged.ok === false && forged.reason, "bad_signature", "a forged token is refused before any row is read");
});

test("the payload carries no name, no hotel and no amount", async () => {
  const pass = await issuePass({ transferId: TRANSFER, jti: ITEM_A, issuedAt: NOW, cutoffAt: null, bagCount: 3, secret: SECRET });
  assert.deepEqual(Object.keys(pass.payload).sort(), ["exp", "iat", "j", "k", "n", "t", "v"]);
});

test("a pass expires at the cutoff plus three hours, and at a day whatever the cutoff", async () => {
  assert.equal(passExpirySeconds(NOW, new Date("2026-08-15T22:00:00Z")) * 1000, Date.parse("2026-08-16T01:00:00Z"));
  assert.equal(passExpirySeconds(NOW, new Date("2026-08-20T22:00:00Z")) * 1000, Date.parse("2026-08-16T19:00:00Z"), "24 hours is the ceiling");
  const pass = await issuePass({ transferId: TRANSFER, jti: ITEM_A, issuedAt: NOW, cutoffAt: new Date("2026-08-15T22:00:00Z"), bagCount: 1, secret: SECRET });
  const late = await verifyPass(pass.token, SECRET, new Date("2026-08-16T02:00:00Z"), pass.tokenHash);
  assert.equal(late.ok === false && late.reason, "pass_expired");
});

test("reissuing a pass revokes the one before it", async () => {
  const first = await issuePass({ transferId: TRANSFER, jti: ITEM_A, issuedAt: NOW, cutoffAt: null, bagCount: 1, secret: SECRET });
  const second = await issuePass({ transferId: TRANSFER, jti: PURCHASE_A, issuedAt: NOW, cutoffAt: null, bagCount: 1, secret: SECRET });
  const stale = await verifyPass(first.token, SECRET, NOW, second.tokenHash);
  assert.equal(stale.ok === false && stale.reason, "pass_replaced");
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash, await sha256Hex(first.token), "the database stores the hash, never the token");
});

test("a stolen pass is not a counter session", async () => {
  const pass = await issuePass({ transferId: TRANSFER, jti: ITEM_A, issuedAt: NOW, cutoffAt: null, bagCount: 1, secret: SECRET });
  const wrongKind = await verifyPass(pass.token, SECRET, NOW, pass.tokenHash, "scan");
  assert.equal(wrongKind.ok === false && wrongKind.reason, "wrong_kind");
  const session = await issueScanSession(TRANSFER, ITEM_A, NOW, SECRET);
  assert.equal((await verifyPass(session.token, SECRET, NOW, undefined, "scan")).ok, true);
  assert.equal(Date.parse(session.expiresAt) - NOW.getTime(), 15 * 60_000);
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abc"), true);
});

// ── what the routes are not allowed to do ────────────────────

const routeSources = () => {
  const root = fileURLToPath(new URL("../app/api", import.meta.url));
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => { const full = `${dir}/${entry}`; return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : []; });
  return walk(root).map((path) => ({ path, source: readFileSync(path, "utf8") }));
};

/** The only routes that write a row with no owner, and therefore the only ones
 *  that cannot pass the identity checks below.
 *
 *  A survey response has no `user_id` on purpose: the UX study is answered by
 *  people with no account, and the team study is worth running only because
 *  nobody can trace a row back to a person. Naming them here keeps the exemption
 *  a decision rather than a hole — `tests/survey.test.ts` then pins what they
 *  are allowed to touch instead, since the checks below cannot. */
const OWNERLESS = ["/api/survey/route.ts", "/api/survey/export/route.ts"];
const ownerless = (path: string) => OWNERLESS.some((tail) => path.split("\\").join("/").endsWith(tail));

test("no route takes the traveler's identity from the request", () => {
  for (const { path, source } of routeSources()) {
    assert.ok(!/body\.(body\.)?user_?[Ii]d/.test(source), `${path} reads a user id out of a body`);
    assert.ok(!/userId:\s*body\./.test(source), `${path} passes a body value as an identity`);
    if (ownerless(path)) continue;
    if (/export async function (POST|PUT|PATCH|DELETE|GET)/.test(source)) assert.ok(/getTraveler\(\)/.test(source) || /partnerAuthorised\(/.test(source), `${path} has no identity check at all`);
  }
});

test("no route writes a transfer status: it is derived from the ledger", () => {
  for (const { path, source } of routeSources()) {
    for (const call of source.match(/from\("bag_transfers"\)\s*\.update\(\{[^}]*\}/g) ?? []) {
      assert.ok(!/\bstatus:/.test(call), `${path} writes bag_transfers.status directly — 0012 derives it from transfer_events`);
    }
    assert.ok(!/delivery_step|deliveryStep\s*=/.test(source), `${path} still carries the client-side step counter`);
  }
});

test("the service key is never handed to a route that has not proved who is asking", () => {
  for (const { path, source } of routeSources()) {
    if (ownerless(path)) continue;
    if (!/adminOrNull\(\)|createAdminClient\(/.test(source)) continue;
    assert.ok(/getTraveler\(\)|partnerAuthorised\(/.test(source), `${path} uses the service key with no identity check`);
    assert.ok(/\.eq\("user_id"|\.eq\("id"|insertEvent\(|handoffTransfer\(|recordEligibility\(|attachSeals\(/.test(source), `${path} uses the service key without scoping the row`);
  }
});

test("the simulator only exists when it is switched on", () => {
  const source = readFileSync(new URL("../app/api/transfers/[id]/simulate/route.ts", import.meta.url), "utf8");
  assert.ok(/if \(!simulatorOn\(\)\) return json\(\{ error: "not_found" \}, 404\)/.test(source), "the flag must be the first thing checked");
  assert.ok(/source !== "simulated"/.test(source), "a live or sample row must not be advanced by the simulator");
});
