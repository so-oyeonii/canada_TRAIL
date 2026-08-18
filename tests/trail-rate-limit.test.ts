import assert from "node:assert/strict";
import test from "node:test";
import { RATE_LIMIT, RATE_WINDOW_MS, burstLimited, burstStore, chatQuota, type RecordHit } from "../lib/api/rate-limit.ts";
import { sameOrigin } from "../lib/api/http.ts";

// The old limiter was a `Map` in module scope on `/api/chat`. Fluid Compute runs several
// instances, so what a traveller actually met was twelve turns a minute *per instance*, on
// the one route that pays OpenAI per call. These pin the two halves of the replacement:
// the burst tier still refuses a hot loop locally, and the durable tier is what decides.

const never: RecordHit = async () => { throw new Error("the durable tier should not have been reached"); };
const answers = (over: boolean): RecordHit => async () => over;
const base = { now: 0, deployed: true, canRecord: true };

/* ── the burst tier ─────────────────────────────────────────────────────── */

test("the limit is a ceiling on turns, not on the turn that crosses it", () => {
  const store = burstStore();
  for (let i = 0; i < RATE_LIMIT; i += 1) assert.equal(burstLimited(store, "u1", 0), false, `turn ${i + 1} was refused`);
  assert.equal(burstLimited(store, "u1", 0), true);
});

test("one traveller's spending is not charged to another", () => {
  const store = burstStore();
  for (let i = 0; i < RATE_LIMIT + 4; i += 1) burstLimited(store, "u1", 0);
  assert.equal(burstLimited(store, "u2", 0), false);
});

test("the window moves, so a quota spent an hour ago is not still spent", () => {
  const store = burstStore();
  for (let i = 0; i < RATE_LIMIT + 1; i += 1) burstLimited(store, "u1", 0);
  assert.equal(burstLimited(store, "u1", RATE_WINDOW_MS), false);
});

/* ── the two tiers together ─────────────────────────────────────────────── */

test("a burst is refused without a round trip to the database", async () => {
  const store = burstStore();
  for (let i = 0; i < RATE_LIMIT + 1; i += 1) burstLimited(store, "u1", 0);
  assert.equal(await chatQuota({ ...base, store, key: "u1", record: never }), "limited");
});

test("the durable answer decides a turn the burst tier let through", async () => {
  assert.equal(await chatQuota({ ...base, store: burstStore(), key: "u1", record: answers(true) }), "limited");
  assert.equal(await chatQuota({ ...base, store: burstStore(), key: "u1", record: answers(false) }), "ok");
});

test("a traveller under the limit on this instance can still be over it on the row", async () => {
  // The whole point of 0030: this instance has seen one turn, the row has seen thirteen.
  const store = burstStore();
  assert.equal(await chatQuota({ ...base, store, key: "u1", record: answers(true) }), "limited");
});

/* ── what happens when the counter cannot be read ───────────────────────── */

test("a database that throws closes the paid route instead of opening it", async () => {
  const record: RecordHit = async () => { throw new Error("connection reset"); };
  assert.equal(await chatQuota({ ...base, store: burstStore(), key: "u1", record }), "unavailable");
});

test("an answer that is not a boolean is not read as permission", async () => {
  assert.equal(await chatQuota({ ...base, store: burstStore(), key: "u1", record: async () => null }), "unavailable");
});

test("a deployed build with no service key is a misconfiguration, not a free route", async () => {
  assert.equal(await chatQuota({ ...base, canRecord: false, store: burstStore(), key: "u1", record: never }), "unavailable");
});

test("a laptop with no service key runs on the burst tier, which is the whole truth there", async () => {
  assert.equal(await chatQuota({ ...base, deployed: false, canRecord: false, store: burstStore(), key: "u1", record: never }), "ok");
});

test("the window handed to the database is the same one the burst tier uses", async () => {
  let seen: [number, number] | null = null;
  const record: RecordHit = async (_key, windowSeconds, limit) => { seen = [windowSeconds, limit]; return false; };
  await chatQuota({ ...base, store: burstStore(), key: "u1", record });
  assert.deepEqual(seen, [RATE_WINDOW_MS / 1000, RATE_LIMIT]);
});

/* ── the origin guard ───────────────────────────────────────────────────── */

const req = (headers: Record<string, string>) => new Request("https://trail.app/api/chat", { method: "POST", headers });

test("a cross-site post is refused even when it sends no Origin at all", () => {
  // This is the hole. `Origin` absent used to mean allowed, and a cross-site form post is
  // one of the shapes that omits it.
  assert.equal(sameOrigin(req({ "sec-fetch-site": "cross-site", host: "trail.app" })), false);
});

test("a sibling subdomain is not this app's own pages", () => {
  assert.equal(sameOrigin(req({ "sec-fetch-site": "same-site", host: "trail.app" })), false);
});

test("a typed-in URL is not a fetch from a screen", () => {
  assert.equal(sameOrigin(req({ "sec-fetch-site": "none", host: "trail.app" })), false);
});

test("the app's own pages get through", () => {
  assert.equal(sameOrigin(req({ "sec-fetch-site": "same-origin", origin: "https://trail.app", host: "trail.app" })), true);
});

test("Sec-Fetch-Site outranks an Origin that disagrees with it", () => {
  // Origin is settable by a proxy in front of the app; Sec-Fetch-Site is on the browser's
  // forbidden-header list and page script cannot touch it.
  assert.equal(sameOrigin(req({ "sec-fetch-site": "cross-site", origin: "https://trail.app", host: "trail.app" })), false);
});

test("an Origin from somewhere else is still refused on a browser too old to say so", () => {
  assert.equal(sameOrigin(req({ origin: "https://evil.example", host: "trail.app" })), false);
});

test("the proxied host is what Origin is compared against, not the internal one", () => {
  assert.equal(sameOrigin(req({ origin: "https://trail.app", "x-forwarded-host": "trail.app", host: "trail.internal" })), true);
});

test("a browser too old for either header is still served", () => {
  // Safari < 16.4 sends neither on a same-origin POST. Refusing it would lock those phones
  // out of the app; what it could otherwise reach is answered by the quota, not by this.
  assert.equal(sameOrigin(req({ host: "trail.app" })), true);
});
