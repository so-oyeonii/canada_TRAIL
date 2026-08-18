import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";

// Two lists describe the same rule: which columns of `trips` a browser may write.
// One is a column GRANT in SQL, the other is `TRIP_WRITABLE` in the client. When they
// drift, Postgres answers 42501 and the traveller watches a save fail for a reason no
// screen can explain. So they are compared here rather than in production.
//
// The union is taken over every migration on purpose: G3's 0021 adds `timezone` to the
// column and to the grant, and this test is what then makes it add it to `TRIP_WRITABLE`.

const root = (path: string) => new URL(`../${path}`, import.meta.url);
const migrations = readdirSync(root("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

const granted = new Set<string>();
for (const file of migrations) {
  const sql = readFileSync(root(`supabase/migrations/${file}`), "utf8").replace(/--[^\n]*/g, "");
  for (const [, cols] of sql.matchAll(/grant\s+update\s*\(([^)]*)\)\s*\n?\s*on\s+public\.trips/gi)) {
    for (const col of cols.split(",")) granted.add(col.trim());
  }
}

const state = readFileSync(root("app/(app)/app-state.tsx"), "utf8");
const declared = (state.match(/export const TRIP_WRITABLE = \[([^\]]*)\]/) ?? [])[1] ?? "";
const writable = new Set([...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]));

test("the client's writable trip columns are exactly the ones granted", () => {
  assert.ok(granted.size > 0, "no `grant update (...) on public.trips` found in any migration");
  assert.deepEqual([...writable].sort(), [...granted].sort());
});

test("the columns that decide money, lifecycle and eligibility are on neither list", () => {
  for (const column of ["status", "currency", "hotel_verified_at", "hotel_id", "user_id", "id", "provisional_until"]) {
    assert.ok(!granted.has(column), `${column} is grantable to the browser`);
    assert.ok(!writable.has(column), `${column} is in TRIP_WRITABLE`);
  }
});

test("0020 revokes the update and the delete before it grants anything back", () => {
  const sql = readFileSync(root("supabase/migrations/0020_trip_columns_are_not_all_writable.sql"), "utf8");
  const revoke = sql.search(/revoke\s+update,\s*delete\s+on\s+public\.trips\s+from\s+authenticated/i);
  const grant = sql.search(/grant\s+update\s*\(/i);
  assert.ok(revoke >= 0, "the blanket update/delete grant of 0002 is still standing");
  assert.ok(grant > revoke, "the column grant runs before the revoke that would wipe it");
});

test("both new trigger functions pin their search path", () => {
  const sql = readFileSync(root("supabase/migrations/0020_trip_columns_are_not_all_writable.sql"), "utf8");
  for (const fn of ["clear_hotel_verification", "freeze_trip_currency"]) {
    const body = sql.slice(sql.indexOf(`function public.${fn}()`));
    assert.match(body.slice(0, 200), /set search_path = ''/, `${fn} would trip the security advisor`);
  }
});

test("the currency freezes on a plan, not on a purchase", () => {
  const sql = readFileSync(root("supabase/migrations/0020_trip_columns_are_not_all_writable.sql"), "utf8");
  const fn = sql.slice(sql.indexOf("function public.freeze_trip_currency()"), sql.indexOf("trips_currency_is_frozen before update"));
  assert.match(fn, /from public\.plans/, "a trip with no purchases still has buckets already denominated in its currency");
  assert.ok(!/from public\.purchases/.test(fn), "a zero-purchase trip could still have its wallet silently rescaled");
});
