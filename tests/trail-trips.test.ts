import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseTripCreate, toMinorUnits, FREE_TIME, MAX_AREAS } from "../lib/trips/input.ts";
import { splitBudget } from "../app/onboarding/budget.ts";

// Onboarding used to insert `trips` and `plans` from the browser. That grant is
// what let a client set `plans.status = 'approved'` on itself, so the body is
// parsed here and the rows are written by `POST /api/trips`.

const body = (over: Record<string, unknown> = {}) => ({ country: "Canada", city: "Toronto", areas: ["Kensington Market"], startDate: "2026-09-01", endDate: "2026-09-05", hotelName: "The Annex Hotel", hotelAddress: "296 Brunswick Ave", companions: "Solo trip", freeTime: "3 hours", currency: "CAD", total: 250, ...over });

test("a trip without a country, a city or a hotel is not a trip", () => {
  for (const field of ["country", "city", "hotelName"]) {
    const parsed = parseTripCreate(body({ [field]: "   " }));
    assert.equal(parsed.ok, false);
    assert.equal(parsed.ok === false && parsed.field, field);
  }
});

test("the leaving date cannot come before the arrival date", () => {
  const parsed = parseTripCreate(body({ startDate: "2026-09-05", endDate: "2026-09-01" }));
  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok === false && parsed.field, "endDate");
  // `trips_date_order` says the same thing in the database; this is the named 400.
  assert.equal(parseTripCreate(body({ startDate: null, endDate: null })).ok, true);
  assert.equal(parseTripCreate(body({ startDate: "01/09/2026" })).ok, false);
});

test("a control character never reaches a row, and areas are capped and deduped", () => {
  const parsed = parseTripCreate(body({ city: "Tor\u0000onto", areas: ["Kensington", "Kensington", ...Array.from({ length: 20 }, (_, i) => `area ${i}`)] }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.city, "Tor onto");
  assert.ok(parsed.value.areas.length <= MAX_AREAS);
  assert.equal(new Set(parsed.value.areas).size, parsed.value.areas.length);
});

test("an unknown currency or free-time value is a named 400, never a coerced default", () => {
  assert.equal(parseTripCreate(body({ currency: "XBT" })).ok, false);
  assert.equal(parseTripCreate(body({ freeTime: "all week" })).ok, false);
  for (const option of FREE_TIME) assert.equal(parseTripCreate(body({ freeTime: option })).ok, true);
});

test("the budget arrives in whole units and is refused outside the range", () => {
  assert.equal(parseTripCreate(body({ total: 250.5 })).ok, false);
  assert.equal(parseTripCreate(body({ total: 5 })).ok, false);
  assert.equal(parseTripCreate(body({ total: 250_000 })).ok, false);
  const parsed = parseTripCreate(body());
  assert.equal(parsed.ok && parsed.totalUnits, 250);
});

test("a yen trip is not stored a hundredfold", () => {
  assert.equal(toMinorUnits(30000, "JPY"), 30000);
  assert.equal(toMinorUnits(250, "CAD"), 25000);
  // The split happens in whole units and the CHECK constraint is in minor ones,
  // so the three buckets have to still add up after the conversion.
  const b = splitBudget(250, 15);
  assert.equal(toMinorUnits(b.planned, "CAD") + toMinorUnits(b.reserve, "CAD") + toMinorUnits(b.flexible, "CAD"), toMinorUnits(b.total, "CAD"));
});

test("the onboarding form writes no rows of its own", () => {
  const form = readFileSync(new URL("../app/onboarding/new-trip-form.tsx", import.meta.url), "utf8");
  assert.ok(!/from\("(trips|plans)"\)/.test(form), "onboarding is inserting a row from the browser again");
  assert.ok(!/supabase/i.test(form), "onboarding is holding a supabase client again");
  assert.ok(/fetch\("\/api\/trips"/.test(form), "onboarding must go through the server route");
});

test("the trips route decides the reserve and the split itself", () => {
  const route = readFileSync(new URL("../app/api/trips/route.ts", import.meta.url), "utf8");
  assert.ok(/getTraveler\(\)/.test(route), "the route must read identity from the session");
  assert.ok(/quoteFee\(/.test(route), "the reserve must come from the price list, not from the body");
  assert.ok(!/body\.body\.(planned|reserve|flexible|buckets)/.test(route), "no bucket may be accepted from the client");
  assert.ok(/from\("trips"\)\.delete\(\)/.test(route), "a failed plan write must take its trip with it");
});
