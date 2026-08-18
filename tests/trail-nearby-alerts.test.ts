import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ENTER_METRES, EXIT_METRES, RECHECK_METRES, shouldRecheck, stepFence, type FenceState } from "../lib/discovery/geofence.ts";
import { COOLDOWN_MS, DAILY_CAP, SAMPLE_DAILY_CAP, capFor, decideAlert, dayKeyOf, hourInZone, isQuietHour, recordAlert } from "../lib/discovery/alert-policy.ts";
import { EMPTY_MEMORY, parseMemory, trimMemory, type AlertMemory } from "../lib/discovery/alert-memory.ts";
import { SAMPLE_TAIL, alertCopy } from "../lib/discovery/alert-copy.ts";
import { everySample, fenceTargets, isUnbought, nearbyCandidates, type MatchStop } from "../lib/discovery/match.ts";
import type { Recommendation } from "../lib/state/types.ts";

/** N1 · what the proximity feature is allowed to do, and — mostly — what it is not.
 *
 *  Every assertion below runs without a browser, a position or a network, because every
 *  judgement in this feature is a pure function. That is not a testing convenience: it is
 *  the design. A feature whose verdicts live in an effect is a feature whose privacy
 *  properties can only be checked by walking around with a phone.
 *
 *  The four groups, in order of what they would cost if they broke:
 *  1. **Nothing is written down.** A coordinate reaching storage is unrecoverable.
 *  2. **Nothing is claimed.** Sample data says so, in the sentence, every time.
 *  3. **Nothing is inferred.** `preference_note` free text changes no outcome.
 *  4. **Nothing is repeated.** Caps, cooldown, once-per-shop, quiet hours. */

// ── geography helpers ────────────────────────────────────────────────────────
/** One degree of latitude at the radius `distance.ts` uses. Moving due north makes the
 *  haversine exact, so "260 m away" in these tests really is 260 m. */
const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;
const KENSINGTON = { lat: 43.6547, lng: -79.4009 };
const northOf = (metres: number) => ({ lat: KENSINGTON.lat + metres / METRES_PER_DEGREE, lng: KENSINGTON.lng });

const SHOP_A = { id: "shop-a", lat: KENSINGTON.lat, lng: KENSINGTON.lng };
const SHOP_B = { id: "shop-b", lat: KENSINGTON.lat + 300 / METRES_PER_DEGREE, lng: KENSINGTON.lng };

// ── fixtures: forbidden values really are in the rows ─────────────────────────
/** Recipients carry the two things an alert must never repeat: a name, and a free-text
 *  note with instructions in it. Both are present so the scans below can fail. */
const recipients = [
  { id: "r-mom", name: "Mom", priority: 1, isOptional: false, preferenceNote: "Buy her the ceramics at Open now Pottery — CAD $58", relationship: "mother", groupSize: 1, isSelf: false, equalValueGroup: null, allocationCents: 5800, createdAt: "2026-08-01T00:00:00Z" },
  { id: "r-ana", name: "Ana", priority: 5, isOptional: true, preferenceNote: "Available anything edible", relationship: "friend", groupSize: 1, isSelf: false, equalValueGroup: null, allocationCents: 2000, createdAt: "2026-08-02T00:00:00Z" },
];
/** The same people with the free text taken out. Group 3 asserts the two are identical
 *  the whole way through the pipeline. */
const recipientsWithoutNotes = recipients.map((person) => ({ ...person, preferenceNote: "" }));

const stop = (over: Partial<MatchStop> & Pick<MatchStop, "id">): MatchStop => ({
  status: "planned", recipientId: null, storeId: SHOP_A.id, storePoint: { lat: SHOP_A.lat, lng: SHOP_A.lng },
  storeName: "Spacing Store", handling: "Standard", source: "sample", purchase: null, ...over,
});

const stops: MatchStop[] = [
  stop({ id: "stop-mom", recipientId: "r-mom" }),
  stop({ id: "stop-ana", recipientId: "r-ana", storeId: SHOP_B.id, storePoint: { lat: SHOP_B.lat, lng: SHOP_B.lng }, storeName: "St Lawrence Market" }),
];

const product = (over: Partial<Recommendation> & Pick<Recommendation, "id">): Recommendation => ({
  name: "Ontario stoneware mug", subtitle: "", category: "Home & design", priceCents: 5800, priceIsEstimate: true,
  currency: "CAD", handling: "Standard", weightGrams: 600, preferenceTags: ["handmade"], source: "sample", sourceNote: "Sample row",
  store: { id: SHOP_A.id, name: "Spacing Store", area: "Queen West", address: "401 Richmond St W", lat: SHOP_A.lat, lng: SHOP_A.lng, openNow: null },
  ...over,
});
const products = [product({ id: "p-mug" })];

// ── 1 · the fence ─────────────────────────────────────────────────────────────

test("entering is 250 m, leaving is 400 m, and the gap between them is the feature", () => {
  const targets = [SHOP_A];
  let inside: FenceState = {};
  // 260 m: outside the entry radius. Nothing has happened.
  let step = stepFence(inside, targets, northOf(260));
  assert.deepEqual(step.entered, []);
  inside = step.inside;

  // 240 m: in. One event.
  step = stepFence(inside, targets, northOf(240));
  assert.deepEqual(step.entered, [SHOP_A.id]);
  inside = step.inside;

  // Back out to 260 — past the entry radius, nowhere near the exit one. Still inside, and
  // crucially *not* a second entry. This is the whole reason there are two numbers.
  step = stepFence(inside, targets, northOf(260));
  assert.deepEqual(step.entered, []);
  assert.equal(step.inside[SHOP_A.id], true);
  inside = step.inside;

  // 410 m: out.
  step = stepFence(inside, targets, northOf(410));
  assert.equal(step.inside[SHOP_A.id], undefined);
  inside = step.inside;

  // And now 240 m counts again — exactly once.
  step = stepFence(inside, targets, northOf(240));
  assert.deepEqual(step.entered, [SHOP_A.id]);
  assert.deepEqual(stepFence(step.inside, targets, northOf(240)).entered, []);
  assert.ok(ENTER_METRES < EXIT_METRES, "one radius for both directions is a flickering alert on a street corner");
});

test("a shop with no coordinates is neither near nor far", () => {
  const step = stepFence({}, [{ id: "shop-unknown", lat: null, lng: null }], KENSINGTON);
  assert.deepEqual(step.entered, []);
  assert.deepEqual(step.inside, {});
});

test("fifty metres and thirty seconds is not a reason to re-judge the catalogue", () => {
  const mark = { point: KENSINGTON, at: 1_000_000 };
  assert.equal(shouldRecheck(mark, northOf(50), mark.at + 30_000), false);
  assert.equal(shouldRecheck(mark, northOf(RECHECK_METRES + 5), mark.at + 30_000), true, "moved far enough");
  assert.equal(shouldRecheck(mark, northOf(50), mark.at + 61_000), true, "waited long enough");
  assert.equal(shouldRecheck(null, KENSINGTON, 0), true, "the first fix always judges");
});

// ── 2 · the noise policy ──────────────────────────────────────────────────────

const NOW = new Date("2026-08-18T18:00:00Z");                   // 14:00 in Toronto
const TORONTO = "America/Toronto";
const base = (over: Partial<AlertMemory> = {}): AlertMemory => ({ alerted: {}, dayKey: dayKeyOf(NOW, TORONTO), dayCount: 0, ...over });
const decide = (memory: AlertMemory, over: Partial<Parameters<typeof decideAlert>[0]> = {}) =>
  decideAlert({ storeIds: [SHOP_A.id], memory, now: NOW, timeZone: TORONTO, everythingIsSample: false, enabled: true, ...over });

test("the fourth alert of the day does not happen", () => {
  assert.equal(decide(base({ dayCount: DAILY_CAP - 1 })).ok, true);
  const full = decide(base({ dayCount: DAILY_CAP }));
  assert.equal(full.ok, false);
  assert.equal(full.ok === false && full.reason, "daily_cap");
});

test("a sample-only catalogue gets two a day, not three", () => {
  assert.equal(capFor(true), SAMPLE_DAILY_CAP);
  assert.equal(capFor(false), DAILY_CAP);
  assert.equal(SAMPLE_DAILY_CAP < DAILY_CAP, true, "honesty is expressed as frequency as well as wording");
  const third = decide(base({ dayCount: 2 }), { everythingIsSample: true });
  assert.equal(third.ok === false && third.reason, "daily_cap");
  assert.equal(decide(base({ dayCount: 2 }), { everythingIsSample: false }).ok, true);
});

test("nineteen minutes is too soon and twenty-one is not", () => {
  const memory = (agoMs: number) => base({ dayCount: 1, alerted: { "shop-other": new Date(NOW.getTime() - agoMs).toISOString() } });
  const soon = decide(memory(19 * 60_000));
  assert.equal(soon.ok === false && soon.reason, "cooldown");
  assert.equal(decide(memory(21 * 60_000)).ok, true);
  assert.equal(COOLDOWN_MS, 20 * 60_000);
});

test("the same shop is mentioned once for the whole trip, not once a day", () => {
  const yesterday = base({ dayKey: "2026-08-17", dayCount: 3, alerted: { [SHOP_A.id]: "2026-08-17T15:00:00Z" } });
  const again = decide(yesterday);
  assert.equal(again.ok, false);
  assert.equal(again.ok === false && again.reason, "already_alerted", "a new day resets the count, never the list of shops");
  // And the new day really did reset the count — a different shop goes through.
  assert.equal(decide(yesterday, { storeIds: ["shop-c"] }).ok, true);
});

test("three shops in one lane are one alert, and all three are marked", () => {
  const after = recordAlert(base(), [SHOP_A.id, SHOP_B.id, "shop-c"], NOW, TORONTO);
  assert.equal(after.dayCount, 1, "one interruption, however many shops it named");
  assert.deepEqual(Object.keys(after.alerted).sort(), [SHOP_A.id, SHOP_B.id, "shop-c"].sort());
});

test("the switch being off is a refusal with a name, not silence", () => {
  const off = decide(base(), { enabled: false });
  assert.equal(off.ok === false && off.reason, "switched_off");
  const empty = decide(base(), { storeIds: [] });
  assert.equal(empty.ok === false && empty.reason, "no_candidates");
});

// ── 3 · quiet hours belong to the trip, not the phone ─────────────────────────

test("ten at night in Toronto is quiet even when the phone is somewhere else", () => {
  // One instant. 22:00 in Toronto, 11:00 the next morning in Seoul.
  const instant = new Date("2026-08-19T02:00:00Z");
  assert.equal(hourInZone(instant, TORONTO), 22);
  assert.equal(hourInZone(instant, "Asia/Seoul"), 11);
  assert.equal(isQuietHour(instant, TORONTO), true);
  assert.equal(isQuietHour(instant, "Asia/Seoul"), false);

  const refused = decideAlert({ storeIds: [SHOP_A.id], memory: base(), now: instant, timeZone: TORONTO, everythingIsSample: false, enabled: true });
  assert.equal(refused.ok === false && refused.reason, "quiet_hours");
  // The device clock never enters the decision: only the zone that came off `trips.timezone`.
  assert.equal(decideAlert({ storeIds: [SHOP_A.id], memory: base(), now: instant, timeZone: "Asia/Seoul", everythingIsSample: false, enabled: true }).ok, true);
});

test("seven in the morning is still quiet, eight is not", () => {
  assert.equal(isQuietHour(new Date("2026-08-18T11:00:00Z"), TORONTO), true, "07:00 in Toronto");
  assert.equal(isQuietHour(new Date("2026-08-18T12:00:00Z"), TORONTO), false, "08:00 in Toronto");
});

// ── 4 · what the alert says ───────────────────────────────────────────────────

const candidatesAt = (metres: number, over: { stops?: MatchStop[]; products?: Recommendation[]; people?: typeof recipients } = {}) => {
  const point = northOf(metres);
  const rows = over.stops ?? stops;
  const feed = over.products ?? products;
  const targets = fenceTargets(rows, feed);
  const step = stepFence({}, targets, point);
  return nearbyCandidates({ storeIds: step.entered, point, stops: rows, recipients: over.people ?? recipients, products: feed, tags: ["handmade"] });
};

test("a sample row says so in the title and in the last sentence of the body", () => {
  const copy = alertCopy(candidatesAt(120).slice(0, 1), "Toronto");
  assert.ok(copy);
  assert.match(copy.title, /\bSample\b/);
  assert.ok(copy.body.endsWith(SAMPLE_TAIL), copy.body);
  assert.match(copy.body, /stock isn't confirmed/);
  assert.equal(copy.cta, "See it");
});

test("a live row drops the word `Sample` and only then names the shop", () => {
  const live = [stop({ id: "stop-live", recipientId: "r-mom", source: "live" })];
  const copy = alertCopy(candidatesAt(120, { stops: live, products: [] }).slice(0, 1), "Toronto");
  assert.ok(copy);
  assert.doesNotMatch(copy.title, /Sample/);
  assert.doesNotMatch(copy.body, /Sample/);
  assert.match(copy.body, /Spacing Store/, "a live row is one we can stand behind naming");
});

test("no position means no minutes in the sentence, rather than an estimated one", () => {
  const orphan = [{ kind: "plan" as const, id: "x", storeId: SHOP_A.id, storeName: "Spacing Store", handling: "Standard" as const, weightGrams: null, walk: null, source: "sample" as const, tag: null, tier: "planned" as const }];
  const copy = alertCopy(orphan, "Toronto");
  assert.ok(copy);
  assert.doesNotMatch(copy.body.replace(SAMPLE_TAIL, ""), /\d/, "a walking figure needs a distance behind it");
});

test("nothing an alert says is a name, a price, a promise about stock, or an instruction to buy", () => {
  const everything = [
    alertCopy(candidatesAt(120), "Toronto"),
    alertCopy(candidatesAt(120).slice(0, 1), "Toronto"),
    alertCopy(candidatesAt(120, { stops: [stop({ id: "s-live", source: "live", recipientId: "r-mom" })] }), "Toronto"),
    alertCopy(candidatesAt(120, { stops: [] }), "Toronto"),
    alertCopy(candidatesAt(120, { stops: [], products: [product({ id: "p-live", source: "live" })] }), "Toronto"),
  ].filter((copy) => copy !== null);
  assert.ok(everything.length >= 4, "the scan needs something to scan");
  const serialised = JSON.stringify(everything);
  // Names, because a lock screen is a public screen and a surprise is a surprise.
  assert.doesNotMatch(serialised, /\bMom\b|\bAna\b/);
  // Free text off `preference_note` — the words are in the fixture, and must not be here.
  assert.doesNotMatch(serialised, /ceramics|Pottery/i);
  // Stock and hours are sample data too (product rule 3).
  assert.doesNotMatch(serialised, /Open now|In stock|Available|\bopen\b/i);
  // Product rule 2: Trail does not order anything.
  assert.doesNotMatch(serialised, /\bbuy\b|\border\b|\breserve\b|\bcheckout\b/i);
  // `price_is_estimate` is true by default, so a figure here would be a guess with no `≈`.
  assert.doesNotMatch(serialised, /[$€£¥₩]|\bCAD\b|\bUSD\b|\bKRW\b/);
  // Metres and addresses. `about {n} min` is the only measurement allowed out.
  assert.doesNotMatch(serialised, /\d+\s?m\b|\d+\s?metres|Richmond|St W/);
  // And the app never reads a position back to the traveller.
  assert.doesNotMatch(serialised, /you are at|your location is/i);
});

test("the copy module cannot reach a model, and the alert path cannot reach a route", () => {
  const source = ["lib/discovery/alert-copy.ts", "lib/discovery/match.ts", "lib/discovery/alert-policy.ts", "lib/discovery/alert-memory.ts", "lib/discovery/geofence.ts"]
    .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\bfetch\(|\/api\/|lib\/supabase|createClient/, "N1 adds zero API routes, and the judgement never asks a server");
});

// ── 5 · what is inferred, and what is refused ─────────────────────────────────

test("the plan comes before the catalogue, and a must-buy comes before the rest", () => {
  const ranked = candidatesAt(120, { stops: [stop({ id: "stop-ana", recipientId: "r-ana" }), stop({ id: "stop-mom", recipientId: "r-mom" })] });
  assert.equal(ranked[0].kind, "plan", "an approved stop involves no guessing at all");
  const plans = ranked.filter((row) => row.kind === "plan");
  assert.equal(plans[0].id, "stop-mom", "N3's tiers decide which unbought stop speaks first");
});

test("a bought stop is not a reason to interrupt anyone", () => {
  const bought = stop({ id: "stop-done", status: "bought", purchase: { id: "pu-1", stopId: "stop-done", actualPriceCents: 4200, quantity: 1, bags: 1, handling: "Standard", currency: "CAD", note: null, unplannedLabel: null, clientKey: null, recordedAt: NOW.toISOString(), voidedAt: null, voidReason: null } });
  assert.equal(isUnbought(bought), false);
  assert.deepEqual(fenceTargets([bought], []), []);
  // A refund is a status change as well as a void, and `stops.status` is what decides:
  // being told to go and buy something the row still calls bought is the worse mistake, so
  // a voided purchase on a row that still says `bought` stays quiet.
  assert.equal(isUnbought({ ...bought, purchase: { ...bought.purchase!, voidedAt: NOW.toISOString() } }), false);
  assert.equal(isUnbought({ ...bought, status: "planned", purchase: { ...bought.purchase!, voidedAt: NOW.toISOString() } }), true);
  // Skipped and unavailable are decisions the traveller already made. Neither is reopened.
  for (const status of ["skipped", "unavailable"] as const) assert.equal(isUnbought(stop({ id: "s", status })), false);
});

test("free text on a recipient changes nothing, because it is not a parameter", () => {
  const withNotes = candidatesAt(120, { people: recipients });
  const without = candidatesAt(120, { people: recipientsWithoutNotes });
  assert.deepEqual(withNotes, without, "turning `she likes pottery` into a tag is the hallucination this feature refuses to make");
});

test("with no preference tags on the plan, the catalogue signal produces nothing", () => {
  const point = northOf(120);
  const step = stepFence({}, fenceTargets([], products), point);
  assert.deepEqual(nearbyCandidates({ storeIds: step.entered, point, stops: [], recipients, products, tags: [] }), []);
  assert.equal(nearbyCandidates({ storeIds: step.entered, point, stops: [], recipients, products, tags: ["handmade"] }).length, 1);
});

test("one shop is named once, however many rows point at it", () => {
  const two = [product({ id: "p-mug" }), product({ id: "p-tin", name: "Maple tea tin" })];
  const rows = candidatesAt(120, { stops: [], products: two });
  assert.equal(rows.length, 1);
  assert.equal(new Set(rows.map((row) => row.storeId)).size, 1);
});

test("a sample-only set is recognised as one, and a single live row breaks it", () => {
  assert.equal(everySample(candidatesAt(120)), true);
  assert.equal(everySample(candidatesAt(120, { stops: [stop({ id: "s-live", source: "live" })] })), false);
});

// ── 6 · nothing that could locate anybody is written down ─────────────────────

test("the serialised memory holds shop ids and times, and no geography at all", () => {
  const memory = recordAlert(base(), [SHOP_A.id, SHOP_B.id], NOW, TORONTO);
  const serialised = JSON.stringify(memory);
  assert.doesNotMatch(serialised, /lat|lng|coord|accuracy|altitude|heading|speed|coords|point|coordinate/i);
  // Nothing shaped like a degree of latitude or longitude, either.
  assert.doesNotMatch(serialised, /-?\d{2}\.\d{4}/);
  // A round trip through storage does not smuggle a field back in.
  assert.deepEqual(parseMemory(serialised), memory);
  assert.deepEqual(Object.keys(memory).sort(), ["alerted", "dayCount", "dayKey"]);
});

test("the memory module has no parameter that could carry a coordinate", () => {
  const source = readFileSync(new URL("../lib/discovery/alert-memory.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /\blat\b|\blng\b|Point|GeolocationPosition/, "the compiler is the guard here, so the type has to stay absent");
  // And it does not sweep a namespace: the offline outbox lives in localStorage too.
  assert.doesNotMatch(source, /Object\.keys\(\s*localStorage|for \(const key of/);
});

test("an unreadable record is nothing remembered, never a throw on somebody's trip", () => {
  assert.deepEqual(parseMemory("not json"), EMPTY_MEMORY);
  assert.deepEqual(parseMemory(null), EMPTY_MEMORY);
  assert.deepEqual(parseMemory('{"alerted":{"a":1},"dayCount":"x"}'), { alerted: {}, dayKey: "", dayCount: 0 });
});

test("the record is capped, and the oldest entry is the one that goes", () => {
  const alerted: Record<string, string> = {};
  for (let i = 0; i < 12; i += 1) alerted[`shop-${String(i).padStart(2, "0")}`] = new Date(NOW.getTime() + i * 1000).toISOString();
  const trimmed = trimMemory({ alerted, dayKey: "2026-08-18", dayCount: 1 }, 10);
  assert.equal(Object.keys(trimmed.alerted).length, 10);
  assert.equal(trimmed.alerted["shop-00"], undefined);
  assert.equal(trimmed.alerted["shop-11"] !== undefined, true);
});
