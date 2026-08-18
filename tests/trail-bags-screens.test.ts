import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { timelineRows } from "../lib/state/selectors.ts";
import { passExpired, readPass, shouldReissue, writePass, type CachedPass, type PassStore } from "../lib/transfers/pass-cache.ts";
import type { TransferEvent } from "../lib/state/types.ts";

// G5. The bag and delivery screens. What these assert is not that the frames were
// copied — it is that the four failure branches survived being made pretty, that the
// custody timeline is still the ledger's answer and not the screen's, and that nothing
// on the payment screen claims a card Trail has never seen.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/** Comments in this repo explain *why* a string is absent, so they name it. The
 *  assertions below are about what reaches a traveller's screen, not about what the
 *  next engineer is told. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const drop = read("app/(app)/bags/drop/page.tsx");
const track = read("app/(app)/bags/track/page.tsx");
const done = read("app/(app)/bags/done/page.tsx");
const entry = read("app/(app)/bags/page.tsx");
const review = read("app/(app)/bags/review/page.tsx");
const pay = read("app/(app)/bags/pay/page.tsx");
const lens = read("app/(app)/trail/plan/delivery/page.tsx");
const state = read("app/(app)/app-state.tsx");
const view = read("app/(app)/view.ts");
const worker = read("public/sw.js");

const event = (seq: number, eventType: TransferEvent["eventType"], occurredAt: string, actor: TransferEvent["actor"] = "partner"): TransferEvent =>
  ({ id: `e${seq}`, seq, eventType, actor, itemId: null, occurredAt, createdAt: "2026-08-18T23:59:00Z", location: null, note: null, payload: {}, source: "simulated" });

// ── the timeline ───────────────────────────────────────────────────────────
test("a finished run reads as four done steps and nothing else", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "collected", "2026-08-18T18:40:00Z"), event(3, "in_transit", "2026-08-18T18:55:00Z", "driver"), event(4, "handed_off", "2026-08-18T19:47:00Z", "hotel")], null);
  assert.deepEqual(rows.map((r) => r.label), ["Dropped off", "Collected by Trail", "On the way to hotel", "Delivered"]);
  assert.deepEqual(new Set(rows.map((r) => r.state)), new Set(["done"]));
});

test("exactly one step is the one happening now", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "collected", "2026-08-18T18:40:00Z")], null);
  assert.deepEqual(rows.map((r) => r.state), ["done", "current", "future", "future"]);
});

test("before anything moves, the first step is what is being asked for", () => {
  assert.deepEqual(timelineRows([], null).map((r) => r.state), ["current", "future", "future", "future"]);
});

test("the row is timed by what happened, not by when the phone got signal", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler")], null);
  assert.equal(rows[0].at, "2026-08-18T18:12:00Z");
  assert.ok(!rows.some((row) => row.at === "2026-08-18T23:59:00Z"), "createdAt is the server's clock and must not be shown as the event time");
});

test("order comes from seq, whatever order the rows arrived in", () => {
  const rows = timelineRows([event(3, "in_transit", "2026-08-18T18:55:00Z", "driver"), event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "collected", "2026-08-18T18:40:00Z")], null);
  assert.deepEqual(rows.slice(0, 3).map((r) => r.at), ["2026-08-18T18:12:00Z", "2026-08-18T18:40:00Z", "2026-08-18T18:55:00Z"]);
});

test("a delay is a fifth row where it happened, and the run carries on", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "collected", "2026-08-18T18:40:00Z"), event(3, "delayed", "2026-08-18T19:05:00Z", "traveler")], null);
  assert.deepEqual(rows.map((r) => r.label), ["Dropped off", "Collected by Trail", "Running late", "On the way to hotel", "Delivered"]);
  assert.equal(rows[2].state, "warning");
  assert.equal(rows.at(-1)?.state, "future", "a delay must not remove the steps still ahead");
});

test("a seal problem is reported without ending the delivery", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "seal_issue", "2026-08-18T18:20:00Z", "traveler")], null);
  assert.equal(rows.find((r) => r.label === "Seal problem reported")?.state, "warning");
  assert.ok(rows.some((r) => r.label === "Delivered"));
});

test("a partner declining is recoverable; the hotel declining is not", () => {
  const partner = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "declined", "2026-08-18T18:30:00Z", "partner")], null);
  assert.equal(partner.find((r) => r.state === "warning")?.label, "The hotel did not take the bags");
  assert.ok(partner.some((r) => r.label === "Delivered"), "a partner refusal leaves the run open");

  const hotel = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "collected", "2026-08-18T18:40:00Z"), event(3, "arrived", "2026-08-18T19:30:00Z", "driver"), event(4, "declined", "2026-08-18T19:45:00Z", "hotel")], "front_desk_refused");
  assert.equal(hotel.at(-1)?.state, "failed");
  assert.ok(!hotel.some((r) => r.label === "Delivered"), "a refused handoff must never leave a Delivered row waiting");
});

test("a cancelled delivery stops the list where it stopped", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "cancelled", "2026-08-18T18:15:00Z", "traveler")], null);
  assert.deepEqual(rows.map((r) => r.label), ["Dropped off", "Delivery cancelled"]);
  assert.equal(rows.at(-1)?.state, "failed");
});

test("cancelling before anything moved leaves one row, not a queue", () => {
  const rows = timelineRows([event(1, "cancelled", "2026-08-18T17:00:00Z", "traveler")], null);
  assert.deepEqual(rows.map((r) => r.label), ["Delivery cancelled"]);
});

test("a handoff failure column with no ledger row still draws the failure", () => {
  const rows = timelineRows([event(1, "dropped_off", "2026-08-18T18:12:00Z", "traveler"), event(2, "collected", "2026-08-18T18:40:00Z")], "tag_mismatch");
  assert.equal(rows.at(-1)?.state, "failed");
  assert.ok(!rows.some((r) => r.label === "Delivered"));
});

// ── the pass cache ─────────────────────────────────────────────────────────
const memoryStore = (): PassStore & { map: Map<string, string> } => { const map = new Map<string, string>(); return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }; };
const pass = (over: Partial<CachedPass> = {}): CachedPass => ({ token: "TRLP1.body.sig", issuedAt: "2026-08-18T18:00:00Z", expiresAt: "2026-08-18T22:00:00Z", version: 1, referenceCode: "TRL-48173", bagCount: 3, ...over });

test("a pass is read back for its own delivery and no other", () => {
  const store = memoryStore();
  writePass("transfer-a", pass(), store);
  assert.equal(readPass("transfer-a", store)?.token, "TRLP1.body.sig");
  assert.equal(readPass("transfer-b", store), null, "another delivery's pass must never be shown at this counter");
});

test("the pass never lands in the state cache, which gets swept", () => {
  const store = memoryStore();
  writePass("transfer-a", pass(), store);
  assert.ok([...store.map.keys()].every((key) => key.startsWith("trail-pass-v1:")));
  assert.ok(![...store.map.keys()].some((key) => key.startsWith("trail-cache-v")));
});

test("a damaged or foreign entry reads as no pass at all", () => {
  const store = memoryStore();
  store.setItem("trail-pass-v1:t", "{\"token\":\"TRLP1.a.b\"");                        // truncated write
  assert.equal(readPass("t", store), null);
  store.setItem("trail-pass-v1:t", JSON.stringify({ token: "hello", expiresAt: "2026-08-18T22:00:00Z", issuedAt: "2026-08-18T18:00:00Z" }));
  assert.equal(readPass("t", store), null, "anything that is not a TRLP1 token is not a pass");
});

test("an expired token is expired, and near-expiry is worth a reissue", () => {
  const at = (iso: string) => new Date(iso);
  assert.equal(passExpired(pass(), at("2026-08-18T21:59:00Z")), false);
  assert.equal(passExpired(pass(), at("2026-08-18T22:00:00Z")), true);
  assert.equal(passExpired(null), true);
  assert.equal(shouldReissue(pass(), at("2026-08-18T19:00:00Z")), false);
  assert.equal(shouldReissue(pass(), at("2026-08-18T20:30:00Z")), true, "a pass that dies in the queue should have been replaced before it");
  assert.equal(shouldReissue(null), true);
});

// ── constitution 3: the label comes from the row ──────────────────────────
test("the delivery lens labels the counter from the counter's own source", () => {
  assert.match(lens, /sourceChip/);
  assert.match(lens, /counter\?\.source/);
  assert.ok(!/labels\.transfer|labels\.stops/.test(lens), "a counter's provenance is not the transfer's");
});

test("the embedded counter carries a source all the way from the select", () => {
  assert.match(read("lib/state/queries.ts"), /dropoff_cutoff, lat, lng, source/);
  assert.match(read("lib/state/shape.ts"), /source: row\.source \?\? "sample"/);
  assert.match(read("lib/state/types.ts"), /partnerNote: string; source: DataSource/);
});

// ── the payment screen ────────────────────────────────────────────────────
test("no card that was never stored, and no Apple mark", () => {
  assert.ok(!/4242/.test(code(state)), "4242 is a Stripe test number and claims a card Trail has never seen");
  assert.ok(!/Saved card|Saved Visa/.test(code(state)));
  assert.match(state, /Apple Pay \(simulated\)/);
  assert.match(state, /Nothing is stored/);
  assert.ok(!/apple-?pay\.(svg|png)|ApplePayLogo/i.test(pay + state), "the Apple Pay mark is licensed for real support only");
});

test("nothing is pre-approved: no default method, and the button says why it is off", () => {
  assert.match(pay, /useState\(""\)/);
  assert.ok(!/useState\("apple"\)/.test(pay), "a pre-selected method turns one tap into consent to something nobody chose");
  assert.match(pay, /Choose a payment method first/);
  assert.match(pay, /disabled=\{status !== "idle" \|\| !payMethod/);
  assert.match(pay, /role="radiogroup"/);
});

test("the amount charged is the frozen fee, read back, and never sent", () => {
  assert.ok(!/amountCents:|amount:/.test(pay.split("payments/simulate")[1]?.slice(0, 400) ?? ""), "the client must not send the amount it wants charged");
  assert.match(pay, /priceExact\(feeCents/);
});

test("using the flexible bucket names the amount, the bucket and the balance", () => {
  assert.match(view, /flexibleRemedyLabel/);
  assert.match(view, /from flexible \(/);
  assert.match(pay, /approve_flexible: flexibleRemedyLabel\(shortCents, wallet\.flexibleCents, currency\)/);
  assert.match(pay, /blocked=\{blockCode === "reserve_short" && !coverable/);
});

test("the six refusals and the four handoff failures are still reachable", () => {
  assert.match(pay, /reserve_short/);
  assert.match(track, /HandoffFailed/);
  assert.match(track, /Blocked/);
  assert.match(review, /Blocked/);
  for (const claim of ["dropped_off", "cancelled", "delayed", "seal_issue"]) assert.ok(track.includes(`"${claim}"`), `${claim} is a traveller's claim and needs a way to be made`);
});

// ── the counter screen ────────────────────────────────────────────────────
test("the drop-off screen never invents a way in without a pass", () => {
  assert.ok(!/TRL-48173|say .*code|read .*code to/i.test(code(drop).replace(/referenceCode/g, "")), "there is no lookup-by-code path in /api/partner/scan, so telling staff a code would be a lie");
  assert.match(drop, /connect once before you go/);
  assert.match(drop, /passExpired/);
});

test("the pass is issued where there is signal, not at the counter", () => {
  assert.match(pay, /void issuePass\(transfer\.id\)/);
  assert.match(state, /issuePass = useCallback/);
  assert.ok(!/queue\(("|`)POST(.*)pass/.test(state), "issuing needs the network, so a queued pass would be a promise that cannot be kept");
});

test("the counter screen moves nothing on its own", () => {
  assert.match(drop, /reportEvent\(transfer\.id, "dropped_off"\)/);
  assert.ok(!/deliveryStep\s*[+=]|setDeliveryStep|delivery_step/.test(drop), "custody is the ledger's, never a step this screen increments");
});

// ── the completion screen ─────────────────────────────────────────────────
test("only a delivered run may say Delivered", () => {
  assert.match(done, /lastDelivered\?\.status === "delivered"/);
  assert.match(done, /router\.replace\("\/bags\/track"\)/);
  assert.match(done, /receipt\.sealIds\.length/);
  assert.ok(!/receipt\.bagCount.*tags|bagCount\} Trail/.test(done), "the tag line counts tags, not bags — that difference is the whole handoff proof");
});

test("the rating button is not drawn, because there is nowhere to put a rating", () => {
  assert.ok(!/Rate Trail|rating/i.test(code(done)), "a button that discards the tap is the worst failure this app has");
});

test("delivery complete is a link, not a button that advances a step", () => {
  assert.match(track, /<Link className="btn btn--primary btn--block" href="\/bags\/done">Delivery complete/);
  assert.match(track, /\{delivered && <Link/);
});

test("the payment reference survives a reload", () => {
  assert.match(read("lib/state/queries.ts"), /provider_charge_id/);
  assert.match(read("lib/state/shape.ts"), /reference: row\.provider_charge_id/);
  assert.match(track, /transfer\.payment\?\.reference/);
  assert.match(done, /payment\.reference/);
});

// ── weight, and the entry screen ──────────────────────────────────────────
test("no bag is given a weight nobody weighed", () => {
  assert.match(view, /weightLabel/);
  assert.match(entry, /Weighed at the counter/);
  assert.ok(!/800|0\.8 ?kg|bagCount \* \d/.test(entry), "an invented weight is sent to the server and judged against max_weight_grams");
});

test("the review screen does not claim a distance the app cannot know", () => {
  assert.ok(!/minutes away|min away|nearby/i.test(code(review)), "there is no geolocation in this app, and walk_minutes is a route distance");
  assert.match(review, /Open now/);
});

// ── the service worker ────────────────────────────────────────────────────
test("the service worker never caches a session", () => {
  assert.match(worker, /\/\^\\\/api\\\//);
  assert.match(worker, /\/\^\\\/auth\\\//);
  assert.match(worker, /login/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.ok(!/cache\.put\(request/.test(worker.split("NEVER_CACHE")[0]), "nothing is cached before the exclusions are applied");
});

test("navigations are network-first so a deploy is never served stale", () => {
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /networkFirst/);
  assert.match(worker, /caches\.delete\(name\)/);
});

test("the QR encoder is bundled, not fetched", () => {
  const qr = read("components/qr.tsx");
  assert.match(qr, /import \{ encode \} from "uqr"/);
  assert.ok(!/await import|fetch\(|createElement\("canvas"\)/.test(qr), "a QR that needs the network is a QR that does not open in a basement");
  assert.match(qr, /role="img"/);
  assert.match(qr, /border: 4/);
});
