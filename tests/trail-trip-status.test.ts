import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { dayOfTrip, greetingFor, SECTION_LABEL, sectionOf, todayIn, walletState } from "../lib/trips/status.ts";
import { parseTripPatch } from "../lib/trips/input.ts";

// `trips.status` had four values and the code wrote one of them. `active` never existed,
// so `loadTrailState` leaned on "the most recently touched trip" and every trip a
// traveller had ever taken would have filed under UPCOMING. 0021 derives the status from
// the dates and the trip's own zone; this is the arithmetic half of that, checked against
// an explicit clock so nothing here needs a fake timer.

const at = (iso: string) => new Date(iso);

test("the section a card files under is read from status, never re-decided", () => {
  assert.equal(sectionOf("active"), "current");
  assert.equal(sectionOf("planning"), "upcoming");
  assert.equal(sectionOf("past"), "past");
  // Archiving is a decision a person made. It is history, not a fourth column.
  assert.equal(sectionOf("archived"), "past");
  assert.deepEqual(Object.values(SECTION_LABEL), ["CURRENT", "UPCOMING", "PAST"]);
});

test("today is the trip's date, not the device's", () => {
  // 03:30 UTC on the 16th is still the evening of the 15th in Toronto, and still the
  // afternoon of the 16th in Tokyo. A trip ending on the 15th is over in one and not the
  // other, which is the entire reason the column exists.
  const instant = at("2026-08-16T03:30:00Z");
  assert.equal(todayIn("America/Toronto", instant), "2026-08-15");
  assert.equal(todayIn("Asia/Tokyo", instant), "2026-08-16");
  assert.equal(todayIn("UTC", instant), "2026-08-16");
  // An unknown zone falls back to UTC rather than throwing a screen away.
  assert.equal(todayIn("Mars/Olympus", instant), "2026-08-16");
});

test("Day n of m counts only inside the trip, and never outside it", () => {
  const zone = "America/Toronto";
  assert.deepEqual(dayOfTrip("2026-08-12", "2026-08-16", zone, at("2026-08-13T15:00:00Z")), { n: 2, of: 5 });
  assert.deepEqual(dayOfTrip("2026-08-12", "2026-08-16", zone, at("2026-08-12T15:00:00Z")), { n: 1, of: 5 });
  assert.deepEqual(dayOfTrip("2026-08-12", "2026-08-16", zone, at("2026-08-16T15:00:00Z")), { n: 5, of: 5 });
  assert.equal(dayOfTrip("2026-08-12", "2026-08-16", zone, at("2026-08-11T15:00:00Z")), null, "before the trip there is no day n");
  assert.equal(dayOfTrip("2026-08-12", "2026-08-16", zone, at("2026-08-17T15:00:00Z")), null, "after it, nothing is drawn rather than counting on");
  assert.equal(dayOfTrip(null, "2026-08-16", zone), null);
  assert.equal(dayOfTrip("2026-08-12", null, zone), null);
});

test("a spring-forward day is still one day", () => {
  // 2026-03-08 loses an hour in Toronto. Counting in milliseconds off local midnights
  // would make that day 23 hours and round the wrong way; the arithmetic is on calendar
  // dates in UTC, which has no such day.
  assert.deepEqual(dayOfTrip("2026-03-07", "2026-03-10", "America/Toronto", at("2026-03-09T16:00:00Z")), { n: 3, of: 4 });
});

test("the greeting reads the trip's clock", () => {
  const instant = at("2026-08-16T03:30:00Z");                 // 23:30 in Toronto, 12:30 in Tokyo
  assert.equal(greetingFor("America/Toronto", instant), "Good evening.");
  assert.equal(greetingFor("Asia/Tokyo", instant), "Good afternoon.");
  assert.equal(greetingFor("Mars/Olympus", instant), "Good morning.", "an unknown zone falls back to UTC rather than throwing");
});

test("a trip with no plan behind it is a state, not a zero", () => {
  const now = at("2026-08-16T12:00:00Z");
  assert.equal(walletState({ provisionalUntil: null }, now), "ready");
  assert.equal(walletState({ provisionalUntil: "2026-08-16T12:10:00Z" }, now), "writing", "POST /api/trips is still between its two inserts");
  assert.equal(walletState({ provisionalUntil: "2026-08-16T11:00:00Z" }, now), "incomplete", "the plan write failed and this trip has no wallet");
});

// ── the patch route's refusals ───────────────────────────────
test("a trip patch refuses the three fields the server owns, by name", () => {
  for (const [field, reason] of [["currency", "currency_locked"], ["status", "status_is_derived"], ["hotelVerifiedAt", "server_owned_field"], ["hotelId", "server_owned_field"], ["timezone", "server_owned_field"], ["provisionalUntil", "server_owned_field"]] as const) {
    const parsed = parseTripPatch({ [field]: "anything" });
    assert.equal(parsed.ok, false, `${field} was accepted`);
    assert.equal(parsed.ok === false && parsed.reason, reason);
  }
});

test("a trip patch is a patch: absent is not empty", () => {
  const parsed = parseTripPatch({ hotelName: "  The  Annex Hotel " });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok && parsed.value, { hotel_name: "The Annex Hotel" });
  assert.equal(parseTripPatch({}).ok, false, "a body with nothing in it is not a save");
  assert.equal(parseTripPatch({ city: "   " }).ok, false, "a city cannot be blanked");
  assert.equal(parseTripPatch({ freeTime: "all week" }).ok, false);
  assert.equal(parseTripPatch({ startDate: "2026-09-05", endDate: "2026-09-01" }).ok, false);
  const dated = parseTripPatch({ startDate: null, endDate: null });
  assert.deepEqual(dated.ok && dated.value, { start_date: null, end_date: null });
});

// ── the migration, as a file ─────────────────────────────────
const root = (path: string) => new URL(`../${path}`, import.meta.url);
const lifecycle = readFileSync(root("supabase/migrations/0021_trip_lifecycle.sql"), "utf8");

test("0021 grants the timezone column it adds", () => {
  // 0020 could not: the column did not exist. Without this line changing the city leaves
  // the zone frozen, because every server route writes as `authenticated`.
  assert.match(lifecycle, /alter table public\.trips add column if not exists timezone/);
  assert.match(lifecycle, /grant update \(timezone\) on public\.trips to authenticated/);
});

test("0021's functions pin their search path and none of them is open to anon", () => {
  for (const fn of ["trip_status_for", "apply_trip_status", "mark_provisional_trip", "clear_provisional_trip", "reconcile_trip_statuses", "archive_trip", "discard_provisional_trip"]) {
    const body = lifecycle.slice(lifecycle.indexOf(`function public.${fn}(`));
    assert.match(body.slice(0, 300), /set search_path = ''/, `${fn} would trip the security advisor`);
  }
  assert.ok(!/to anon/.test(lifecycle), "a definer function reachable by anon is a cross-tenant write");
  assert.match(lifecycle, /grant\s+execute on function public\.reconcile_trip_statuses\(\)\s+to authenticated/);
});

test("reconcile takes no user id — one that did would be a cross-tenant write", () => {
  const fn = lifecycle.slice(lifecycle.indexOf("function public.reconcile_trip_statuses()"), lifecycle.indexOf("-- -- ending a trip"));
  assert.match(fn, /user_id = \(select auth\.uid\(\)\)/);
  assert.ok(!/p_user/.test(fn), "the caller must not be able to name whose trips these are");
});

test("discard_provisional_trip cannot reach a trip that has a wallet", () => {
  const fn = lifecycle.slice(lifecycle.indexOf("function public.discard_provisional_trip(p_trip_id uuid)"));
  assert.match(fn, /provisional_until is not null/);
  assert.match(fn, /not exists \(select 1 from public\.plans/);
  assert.match(fn, /user_id = \(select auth\.uid\(\)\)/);
});

test("the spend view is invoker-scoped, which is the whole of its security", () => {
  const view = readFileSync(root("supabase/migrations/0022_trip_spend_summary.sql"), "utf8");
  assert.match(view, /create or replace view public\.trip_spend_summary with \(security_invoker = true\)/);
  assert.match(view, /grant select on public\.trip_spend_summary to authenticated/);
  // The same filter `computeWallet` uses. If the two disagree, a card and a wallet
  // disagree about the same trip and neither says which is right.
  assert.equal((view.match(/voided_at is null/g) ?? []).length >= 3, true);
  assert.match(view, /drop table if exists public\.trip_insights/);
});

test("the preference tag enums are defined exactly once, in the file that runs first", () => {
  const files = readdirSync(root("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const defining = files.filter((file) => /create type public\.preference_tag as enum/.test(readFileSync(root(`supabase/migrations/${file}`), "utf8")));
  assert.deepEqual(defining, ["0023_city_catalog.sql"], "two definitions is a migration run that fails halfway");
  const catalogue = readFileSync(root("supabase/migrations/0023_city_catalog.sql"), "utf8");
  const plans = readFileSync(root("supabase/migrations/0025_preference_tags.sql"), "utf8");
  assert.match(catalogue, /add column if not exists preference_tags\s+public\.preference_tag\[\]/, "an empty column turns `Not touristy` into decoration");
  assert.match(plans, /public\.preference_tag\[\]/, "0025 still uses the type it no longer declares");
});

test("a partner flag cannot be attached to a real storefront without an agreement", () => {
  const catalogue = readFileSync(root("supabase/migrations/0023_city_catalog.sql"), "utf8");
  assert.match(catalogue, /add constraint stores_partner_needs_agreement\s*\n?\s*check \(not is_partner_point or partner_agreement_ref is not null\)/);
  assert.match(catalogue, /set partner_agreement_ref = 'sample:no-agreement'/, "0011's three partner rows have to be backfilled or the constraint refuses them");
  // Every seeded product is Trail's estimate and says so in a column, not in copy.
  assert.match(catalogue, /not quoted by the store/);
  assert.ok(!/photo_url\s*,\s*'http/.test(catalogue), "a stock photograph under a real shop's name is a claim about that shop");
});
