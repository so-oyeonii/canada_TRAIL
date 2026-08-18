import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bagsHref, continueHref, hidesTabBar, isStale, tabOf, tabRoot, tripDay, under } from "../app/(app)/landing.ts";
import type { TransferStatus } from "../lib/state/types.ts";

// The tab bar was renamed and one tab was removed (FIGMA_ADOPTION §2). URLs were not:
// `/trail/*` still resolves, it just belongs to Trips now. These are the rules that decide
// which screen a traveller lands on, and the ones that stop a paid delivery's payment form
// being restored from memory.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = (over: Partial<{ transfer: { status: TransferStatus } | null; bought: unknown[]; unplannedPurchases: unknown[]; pendingBudgetChange: unknown }> = {}) =>
  ({ transfer: null, bought: [], unplannedPurchases: [], pendingBudgetChange: null, ...over }) as never;

test("every UI route belongs to exactly one tab, and old Trail links land on Trips", () => {
  assert.equal(tabOf("/home"), "home");
  assert.equal(tabOf("/account/memory"), "home");
  for (const path of ["/trips", "/trips/past", "/trail", "/trail/plan/gifts", "/trail/plan/gifts/split", "/trail/shop", "/trail/shop/abc/record"]) assert.equal(tabOf(path), "trips", path);
  assert.equal(tabOf("/ask"), "ai");
  assert.equal(tabOf("/ask/brief"), "ai");
  assert.equal(tabOf("/bags/track"), "bags");
  assert.equal(tabOf("/login"), null);
  assert.equal(tabOf("/onboarding"), null);
  assert.equal(tabOf("/workflow"), null);
});

test("a tab is matched by segment, so a longer word is not the same route", () => {
  assert.equal(tabOf("/tripsomething"), null);
  assert.equal(tabOf("/asking"), null);
  assert.ok(under("/trail/plan/gifts/split", "/trail/plan/gifts"));
  assert.ok(!under("/trail/plan/gifts-old", "/trail/plan/gifts"));
});

test("Trips lands on the list; Bags lands wherever the delivery actually is", () => {
  assert.equal(tabRoot("home", app()), "/home");
  assert.equal(tabRoot("trips", app()), "/trips");
  assert.equal(tabRoot("ai", app()), "/ask");
  assert.equal(tabRoot("bags", app()), "/bags/track");
  assert.equal(tabRoot("bags", app({ bought: [1] })), "/bags/select");
  assert.equal(tabRoot("bags", app({ transfer: { status: "paid" } })), "/bags/track");
});

test("bags bought outside the plan are still bags to send", () => {
  assert.equal(bagsHref(app()), "/bags/track");
  assert.equal(bagsHref(app({ unplannedPurchases: [1] })), "/bags/select");
  // A partner holding them beats anything the traveller could pick.
  assert.equal(bagsHref(app({ unplannedPurchases: [1], transfer: { status: "dropped_off" } })), "/bags/track");
});

test("continue opens the picker only when today is known to be empty", () => {
  // Spelled out rather than spread from `app()`: that helper is deliberately `never`, and a
  // spread needs an object type. The four fields are the same ones it seeds.
  const base = { transfer: null, bought: [], unplannedPurchases: [], pendingBudgetChange: null, shoppingStarted: true, stops: [1], routeDirty: false } as never as Parameters<typeof continueHref>[0];
  assert.equal(continueHref(base), "/trail/shop", "undefined is not zero: nothing is known about today until 0024 lands");
  assert.equal(continueHref({ ...base, todayStopCount: 2 }), "/trail/shop");
  assert.equal(continueHref({ ...base, todayStopCount: 0 }), "/bags/select");
  assert.equal(continueHref({ ...base, shoppingStarted: false }), "/trail/plan/gifts");
  assert.equal(continueHref({ ...base, shoppingStarted: false, routeDirty: true }), "/ask");
});

test("the tab bar hides only in front of a write that cannot be taken back", () => {
  for (const path of ["/trail/plan/approval", "/bags/review", "/bags/pay", "/bags/drop", "/trips/new", "/trail/shop/9d1/record"]) assert.equal(hidesTabBar(path), true, path);
  for (const path of ["/home", "/trips", "/trail", "/trail/plan/gifts/split", "/trail/shop", "/ask", "/bags/track", "/bags/select", "/bags/done"]) assert.equal(hidesTabBar(path), false, path);
});

test("tab memory never restores a screen the trip has moved past", () => {
  assert.equal(isStale(app({ bought: [1] }), "/bags/pay"), true, "returning to a payment form offers to charge twice");
  assert.equal(isStale(app({ bought: [1], transfer: { status: "paid" } }), "/bags/select"), true);
  assert.equal(isStale(app(), "/bags/select"), true, "nothing to send");
  assert.equal(isStale(app({ unplannedPurchases: [1] }), "/bags/select"), false);
  assert.equal(isStale(app(), "/account/memory"), true, "settings are not where Home lands");
  assert.equal(isStale(app(), "/trail/plan/approval"), true, "the decision is made");
  assert.equal(isStale(app({ pendingBudgetChange: { id: "x" } }), "/trail/plan/approval"), true, "and it has no tab bar either way");
  assert.equal(isStale(app(), "/trail/plan/people"), true, "route is gone");
  assert.equal(isStale(app(), "/trail/shop/9d1/record"), true, "a stop that may not exist any more");
  assert.equal(isStale(app({ bought: [1] }), "/trail/shop"), false);
  assert.equal(isStale(app(), "/bags/done"), true, "a finished delivery is not a landing");
  assert.equal(isStale(app(), "/trail/plan/gifts/split"), false);
});

test("Day n of m is drawn only when the app knows both ends and today is inside them", () => {
  const trip = { startDate: "2026-08-17", endDate: "2026-08-20" };
  assert.deepEqual(tripDay(trip, new Date(2026, 7, 18)), { n: 2, of: 4 });
  assert.deepEqual(tripDay(trip, new Date(2026, 7, 17)), { n: 1, of: 4 });
  assert.deepEqual(tripDay(trip, new Date(2026, 7, 20)), { n: 4, of: 4 });
  assert.equal(tripDay(trip, new Date(2026, 7, 21)), null, "past the last day there is no day n");
  assert.equal(tripDay(trip, new Date(2026, 7, 16)), null);
  assert.equal(tripDay({ startDate: "2026-08-17", endDate: null }, new Date(2026, 7, 18)), null);
  assert.equal(tripDay({ startDate: null, endDate: null }), null);
});

test("the shell renames the tabs, hides the bar, and sweeps only sessionStorage", () => {
  const shell = read("app/(app)/shell.tsx");
  for (const label of ['label: "Home"', 'label: "Trips"', 'label: "AI"', 'label: "Bags"']) assert.ok(shell.includes(label), label);
  assert.ok(!/label: "Trail"|label: "Ask AI"/.test(shell), "the Trail and Ask AI tabs are gone");
  assert.match(shell, /aria-current=\{current === key \? "page" : undefined\}/);
  assert.match(shell, /\{!bare && <nav className="tab-bar"/);
  // The outbox and the purchase drafts live in localStorage. Sweeping those would throw
  // away what a traveller typed at a till with no signal.
  assert.ok(!/localStorage\.\w+\(/.test(shell), "the shell must not touch localStorage");
  assert.match(shell, /key\.startsWith\("trail:"\) && !key\.startsWith\(`\$\{SESSION_NS\}:`\)/);
});

test("the plan has four lenses and Gifts stays current on its own sub-route", () => {
  const layout = read("app/(app)/trail/plan/layout.tsx");
  for (const label of ['label: "Gifts"', 'label: "Map"', 'label: "Budget"', 'label: "Delivery"']) assert.ok(layout.includes(label), label);
  assert.ok(!/label: "Route"|label: "People"/.test(layout), "Route and People are not lenses any more");
  assert.match(layout, /aria-current=\{under\(pathname, lens\.href\) \? "page" : undefined\}/);
});

test("no status label claims more than the ledger does", () => {
  const track = read("app/(app)/bags/track/page.tsx");
  assert.match(track, /awaiting_payment: "Waiting for payment"/, "nothing is confirmed until it is paid for");
  for (const claim of ["With the partner", "On the way to your hotel", "Delivered to your hotel"]) assert.ok(!track.includes(`: "${claim}"`), claim);
  const steps = read("lib/state/selectors.ts");
  for (const step of ["Dropped off", "Collected by Trail", "On the way to hotel", "Delivered"]) assert.ok(steps.includes(step), step);
  assert.ok(!/"Sealed"|"On route"|"At hotel"/.test(steps), "the old step names claimed a seal and an arrival the ledger never recorded");
});
