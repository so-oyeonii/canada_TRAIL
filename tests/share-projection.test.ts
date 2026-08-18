import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { projectShare, type ShareRecipientRow, type ShareStopRow, type ShareTripRow } from "../lib/share/projection.ts";
import { DEFAULT_SHARE_SCOPE, parseShareScope, SHARE_LINK_LIMIT, type ShareScope } from "../lib/share/scope.ts";
import { issueShareLink, shareExpirySeconds, verifyShareToken } from "../lib/share/link.ts";

/** The only safety net this feature has.
 *
 *  A share link is a public URL that renders someone's trip. Everything that keeps the
 *  hotel, the arrival window, the movement timetable, the per-person budgets and the
 *  payment fields off that page is one file — `lib/share/projection.ts` — and a file is
 *  one careless spread away from leaking a column that did not exist when it was written.
 *
 *  So two assertions, and they are deliberately blunt:
 *
 *  1. **The set of keys the projection emits, with every switch on, equals a literal set
 *     written out below.** Add a column anywhere upstream and let it through, and this
 *     fails. It is meant to fail. Widening the list is a decision somebody makes on
 *     purpose, in a diff, with the reason in the commit.
 *  2. **A string scan over the serialised output.** The fixtures carry whole rows,
 *     including the forbidden ones, and every forbidden value is prefixed with the name of
 *     its own column — `hotel_name The Annex Hotel` — so the scan catches a leaked value
 *     just as well as a leaked key. */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
/** Assertions below are about what the code does, not about what its comments say — and
 *  these files argue with themselves in prose (`404 and not 403`, `+ Invite comes back in
 *  phase 2`). Strip the commentary first, or the tests fail on their own rationale. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");

// ── fixtures: full rows, forbidden values self-labelling ──
const owner = { display_name: "Sooyun", email: "sooyun@example.com", id: "11111111-1111-4111-8111-111111111111", home_currency: "CAD", locale: "en", memory_enabled: true };
const trip = {
  city: "Toronto", country: "Canada", status: "active", start_date: "2026-08-15", end_date: "2026-08-19", currency: "CAD",
  hotel_name: "hotel_name The Annex Hotel", hotel_address: "hotel_address 1 Bloor St W", hotel_verified_at: "2026-08-14T10:00:00Z", hotel_id: "22222222-2222-4222-8222-222222222222",
  areas: ["areas Kensington", "areas Queen West"], free_time: "free_time weekday evenings", companions: "companions Jae", id: "33333333-3333-4333-8333-333333333333", user_id: owner.id,
};
const plan = {
  category: "Home & design", preference: "Thoughtful and useful", total_cents: 25000, planned_cents: 18000,
  delivery_reserve_cents: 4000, flexible_cents: 3000, approved_snapshot: { approved_snapshot: "everything" }, approved_at: "2026-08-14T12:00:00Z", status: "approved", version: 3,
};
const recipients = [
  { id: "44444444-4444-4444-8444-444444444444", name: "Mom", group_size: 1, is_self: false, relationship: "relationship mother", priority: 1, is_optional: false, preference_note: "preference_note dislikes florals", equal_value_group: null, archived_at: null },
  { id: "55555555-5555-4555-8555-555555555555", name: "Coworkers", group_size: 12, is_self: false, relationship: "relationship colleagues", priority: 4, is_optional: true, preference_note: "", equal_value_group: null, archived_at: null },
];
const stops = [
  { recipient_id: recipients[0].id, product_name: "Ontario stoneware mug", store_name: "Spacing Store", area: "Queen West", status: "bought", handling: "Fragile", snapshot_price_cents: 4200, source: "sample", store_address: "store_address 401 Richmond St W", planned_day: 2, sequence: 3, walk_minutes: 7, rationale: "rationale she collects ceramics", saved: true, id: "66666666-6666-4666-8666-666666666666", trip_id: trip.id, store_id: "88888888-8888-4888-8888-888888888888", store: { lat: "lat 43.6487", lng: "lng -79.3966" } },
  { recipient_id: null, product_name: "Maple tea tin", store_name: "St Lawrence Market", area: "Old Town", status: "planned", handling: "Standard", snapshot_price_cents: 1800, source: "live", store_address: "store_address 93 Front St E", planned_day: 1, sequence: 1, walk_minutes: 12, rationale: "", saved: false, id: "77777777-7777-4777-8777-777777777777", trip_id: trip.id, store_id: "99999999-9999-4999-8999-999999999999", store: { lat: "lat 43.6487", lng: "lng -79.3966" } },
];
const transfer = {
  status: "in_transit", bag_count: 3, source: "simulated", reference_code: "reference_code TRL-48173",
  eta_start: "eta_start 2026-08-18T18:30:00Z", eta_end: "eta_end 2026-08-18T19:00:00Z", dropoff_cutoff_at: "dropoff_cutoff_at 2026-08-18T17:00:00Z",
  hotel_name: "hotel_name The Annex Hotel", hotel_address: "hotel_address 1 Bloor St W", fee_cents: 900,
  pass_token_hash: "pass_token_hash deadbeef", pass_expires_at: "pass_expires_at 2026-08-19T00:00:00Z", pass_version: 2, weight_grams: 4200,
};
const ALL_ON: ShareScope = { recipients: true, prices: true, dates: true, delivery: true };
const ALL_OFF: ShareScope = { recipients: false, prices: false, dates: false, delivery: false };
const project = (scope: ShareScope) => projectShare({ owner, trip: trip as ShareTripRow, plan, recipients: recipients as ShareRecipientRow[], stops: stops as ShareStopRow[], transfer, scope });

function keysOf(value: unknown, into = new Set<string>()) {
  if (Array.isArray(value)) { value.forEach((entry) => keysOf(entry, into)); return into; }
  if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) { into.add(key); keysOf(nested, into); }
  return into;
}

/** Everything a share link may ever contain. Adding a line here is the decision. */
const ALLOWED_KEYS = [
  "owner", "name",
  "trip", "city", "country", "status", "startDate", "endDate", "currency",
  "plan", "category", "preference", "totalCents", "plannedCents",
  "gifts", "productName", "storeName", "area", "handling", "source", "priceCents", "recipient",
  "progress", "bought", "total",
  "recipients", "groupSize", "isSelf",
  "delivery", "bagCount",
  "scope", "prices", "dates",
].sort();

test("with every switch on, the projection emits exactly the keys on the list and no others", () => {
  const emitted = [...keysOf(project(ALL_ON))].sort();
  assert.deepEqual(emitted, ALLOWED_KEYS);
});

test("no forbidden column, and no forbidden value, survives the projection", () => {
  const serialised = JSON.stringify(project(ALL_ON));
  // `lat|lng|coord|geo|distance|nearby` were added by N1. The proximity feature has no row
  // to leak — a position is never written down anywhere — but the *reason* that is true is
  // a set of decisions in `lib/discovery/*`, and this line is what keeps a later change
  // from quietly putting one on a public page. The location terms are bounded (`lat`)
  // because `simulated` contains `lat` and a scan that cries wolf gets widened until it
  // stops catching anything. Phase 2's co-editing (0027-0029) inherits
  // it: where the owner is standing is not visible to a member either, because there is
  // nothing to make visible.
  const forbidden = /hotel_address|hotel_name|reference_code|pass_|seal|eta_|dropoff|@|client_op|provider_|last4|token|priority|is_optional|allocation|rationale|planned_day|store_address|free_time|companions|approved_snapshot|preference_note|relationship|lat|lng|latitude|longitude|coord|geo|distance|nearby/i;
  const hit = serialised.match(forbidden);
  assert.equal(hit, null, `the shared page would have carried ${hit?.[0]}`);
});

test("the switches actually withhold, rather than only relabel", () => {
  // `scope` itself always carries all four names — it is the receipt of what was chosen.
  const off = keysOf({ ...project(ALL_OFF), scope: undefined });
  for (const key of ["startDate", "endDate", "currency", "priceCents", "totalCents", "plannedCents", "recipient", "recipients", "delivery", "bagCount"]) {
    assert.ok(!off.has(key), `${key} left the projection with every switch off`);
  }
  // What survives with everything off: the city, the gift and store names, and `source`.
  const bare = project(ALL_OFF);
  assert.equal(bare.trip.city, "Toronto");
  assert.equal(bare.gifts[0].productName, "Ontario stoneware mug");
  assert.equal(bare.gifts[0].source, "sample");
});

test("the Sample and Simulated badges cross the projection on every row", () => {
  const view = project(ALL_ON);
  assert.deepEqual(view.gifts.map((gift) => gift.source), ["sample", "live"]);
  assert.equal(view.delivery?.source, "simulated");
});

test("spend is one count off the stops, and never an amount", () => {
  const view = project(ALL_ON);
  assert.deepEqual(view.progress, { bought: 1, total: 2 });
  assert.ok(!/actual_price|actualPrice|spent/i.test(JSON.stringify(view)), "what was really paid is not shareable at any setting");
});

test("a recipient is resolved to the name the owner typed, never to a uuid", () => {
  const view = project(ALL_ON);
  assert.equal(view.gifts[0].recipient, "Mom");
  assert.equal(view.gifts[1].recipient, null);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(JSON.stringify(view)), "no uuid may leave the projection");
});

test("the arrival window has no switch at all", () => {
  for (const scope of [ALL_ON, ALL_OFF, { ...ALL_OFF, delivery: true }]) {
    const view = project(scope);
    assert.ok(!("etaStart" in (view.delivery ?? {})) && !JSON.stringify(view).includes("18:30"), "hotel + ETA is the sentence this whole feature exists to avoid");
  }
});

// ── the scope contract ──
test("an unknown body cannot widen a link, and the defaults keep three switches off", () => {
  assert.deepEqual(parseShareScope(undefined), DEFAULT_SHARE_SCOPE);
  assert.deepEqual(parseShareScope({ prices: "yes", dates: 1 }), DEFAULT_SHARE_SCOPE);
  assert.deepEqual(parseShareScope({ recipients: false, delivery: true }), { recipients: false, prices: false, dates: false, delivery: true });
  assert.deepEqual(DEFAULT_SHARE_SCOPE, { recipients: true, prices: false, dates: false, delivery: false });
});

// ── the token ──
const SECRET = "share-signing-key-for-tests-only";

test("a link is signed, and one changed character is refused before any query", async () => {
  const now = new Date("2026-08-16T09:00:00Z");
  const issued = await issueShareLink({ tripId: trip.id, shareId: owner.id, issuedAt: now, endDate: trip.end_date, secret: SECRET });
  assert.equal(issued.expired, false);
  if (issued.expired) return;
  assert.ok(issued.token.startsWith("TRLS1."));
  assert.deepEqual(await verifyShareToken(issued.token, SECRET, now, issued.tokenHash), { ok: true, payload: issued.payload });

  const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith("A") ? "B" : "A"}`;
  assert.equal((await verifyShareToken(tampered, SECRET, now)).ok, false);
  assert.equal((await verifyShareToken(issued.token, "another-key", now)).ok, false);
  assert.deepEqual(await verifyShareToken(issued.token, SECRET, now, "0".repeat(64)), { ok: false, reason: "replaced" });
});

test("a drop-off pass is not a share link, and neither opens the other", async () => {
  const now = new Date("2026-08-16T09:00:00Z");
  const issued = await issueShareLink({ tripId: trip.id, shareId: owner.id, issuedAt: now, endDate: null, secret: SECRET });
  if (issued.expired) return assert.fail("a trip with no dates still gets 72 hours");
  assert.equal((await verifyShareToken(issued.token.replace("TRLS1", "TRLP1"), SECRET, now)).ok, false);
});

test("the payload names no city, no hotel and no amount", async () => {
  const issued = await issueShareLink({ tripId: trip.id, shareId: owner.id, issuedAt: new Date(), endDate: null, secret: SECRET });
  if (issued.expired) return assert.fail("expected a link");
  assert.deepEqual(Object.keys(issued.payload).sort(), ["exp", "iat", "k", "s", "t", "v"]);
});

test("a link lives 72 hours, or until the day after the trip ends, whichever comes first", () => {
  const now = new Date("2026-08-16T09:00:00Z");
  const far = shareExpirySeconds(now, "2026-12-31");
  assert.equal(far - Math.floor(now.getTime() / 1000), 72 * 3600);
  // Ends on the 17th: the whole of the 17th, then a day of tail.
  const near = shareExpirySeconds(now, "2026-08-17");
  assert.equal(new Date(near * 1000).toISOString(), "2026-08-19T00:00:00.000Z");
  assert.ok(shareExpirySeconds(now, null) - Math.floor(now.getTime() / 1000) === 72 * 3600);
  // A trip that is long over cannot be shared: the route refuses instead of handing over
  // a URL that opens on the unavailable screen.
  assert.ok(shareExpirySeconds(now, "2026-01-01") < Math.floor(now.getTime() / 1000));
});

test("a link expired by the clock is refused with the same verdict as a forged one", async () => {
  const issuedAt = new Date("2026-08-16T09:00:00Z");
  const issued = await issueShareLink({ tripId: trip.id, shareId: owner.id, issuedAt, endDate: null, secret: SECRET });
  if (issued.expired) return assert.fail("expected a link");
  const later = new Date(issuedAt.getTime() + 73 * 3600_000);
  assert.deepEqual(await verifyShareToken(issued.token, SECRET, later, issued.tokenHash), { ok: false, reason: "expired" });
});

// ── the shape of the code around it ──
const projection = read("lib/share/projection.ts");
const server = read("lib/share/server.ts");
const link = read("lib/share/link.ts");
const migration = read("supabase/migrations/0026_trip_shares.sql");
const listRoute = read("app/api/trips/[id]/share/route.ts");
const revokeRoute = read("app/api/trips/[id]/share/[shareId]/route.ts");
const page = read("app/s/[token]/page.tsx");
const sheet = read("app/(app)/trips/share-sheet.tsx");

test("nothing on this path reads a column it did not name", () => {
  for (const [name, source] of [["projection", projection], ["server", server], ["list route", listRoute], ["revoke route", revokeRoute]] as const) {
    assert.ok(!/select\(\s*["'`]\*/.test(source), `${name} uses select *, which is how a new column reaches a stranger`);
  }
  assert.ok(!/from\("purchases"\)/.test(server), "purchases is never queried: the aggregate is counted off stops.status");
  for (const table of ["chat_messages", "memory_constraints", "plan_allocations", "payments", "receipts", "transfer_events", "bag_transfer_items", "budget_changes"]) {
    assert.ok(!source_has(server, table), `${table} must be unreachable from a share link`);
  }
});
function source_has(source: string, table: string) { return new RegExp(`from\\("${table}"\\)`).test(source); }

test("the share link has its own signing key, and the pass keeps its own", () => {
  assert.match(server, /TRAIL_SHARE_SIGNING_KEY/);
  assert.ok(!/TRAIL_PASS_SIGNING_KEY/.test(code(server)) && !/TRAIL_PASS_SIGNING_KEY/.test(code(link)), "one key rotation must not take the other feature down with it");
  assert.match(read(".env.example"), /TRAIL_SHARE_SIGNING_KEY/);
});

test("the signature is checked before the database is", () => {
  const verify = server.indexOf("verifyShareToken");
  const query = server.indexOf('.from("trip_shares")');
  assert.ok(verify > -1 && query > verify, "a forged token must be refused without a query, or this endpoint enumerates trip ids");
  assert.match(server, /revoked_at \|\| Date\.parse\(share\.expires_at\)/);
});

test("expired, revoked, forged and deleted are one answer", () => {
  assert.ok((server.match(/reason: "gone"/g)?.length ?? 0) >= 6);
  assert.ok(!/reason: "revoked"|reason: "forged"/.test(server), "naming the failure tells a stranger the trip exists");
  assert.match(page, /notFound\(\)/);
});

test("the token never reaches a log line", () => {
  for (const [name, source] of [["server", server], ["list route", listRoute], ["revoke route", revokeRoute], ["page", page]] as const) {
    assert.ok(!/console\.[a-z]+\([^)]*token/i.test(source), `${name} logs a token, which is a working link sitting in a log aggregator`);
  }
});

test("0026 adds a table and changes nobody else's policies", () => {
  assert.match(migration, /alter table public\.trip_shares enable row level security/);
  assert.match(migration, /alter table public\.trip_shares force row level security/);
  assert.match(migration, /grant select on public\.trip_shares to authenticated/);
  assert.ok(!/grant (insert|update|delete)[^;]*to authenticated/.test(migration), "a browser that can write this table can extend its own expiry");
  assert.ok(!/drop policy/.test(migration), "phase 1 rewrites no existing policy");
  const policies = migration.match(/create policy \w+ on public\.(\w+)/g) ?? [];
  assert.deepEqual(policies, ["create policy trip_shares_select on public.trip_shares"]);
  const tables = [...migration.matchAll(/(?:create|alter) table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(tables)], ["trip_shares"]);
  assert.ok(!/for all to/.test(code(migration)), "a `for all` policy here would need a matching with check");
  // The counter is atomic and reachable by the service key alone.
  assert.match(migration, /grant\s+execute on function public\.record_share_view\(uuid\) to service_role/);
  assert.match(migration, /revoke execute on function public\.record_share_view\(uuid\) from public, anon, authenticated/);
});

test("issuing is server-owned, and someone else's trip id is a 404", () => {
  assert.match(listRoute, /const traveler = await getTraveler\(\)/);
  assert.match(listRoute, /trip_not_found"\s*\},\s*404/);
  assert.ok(!/403/.test(code(listRoute)), "403 on a trip id confirms the id belongs to someone");
  assert.match(listRoute, /admin\.from\("trip_shares"\)\.insert/);
  assert.ok(!/db\.from\("trip_shares"\)\.insert/.test(listRoute), "0026 gives authenticated no INSERT");
  assert.match(listRoute, new RegExp(`length >= SHARE_LINK_LIMIT`));
  assert.equal(SHARE_LINK_LIMIT, 3);
  assert.match(revokeRoute, /revoked_at: new Date\(\)\.toISOString\(\)/);
  assert.ok(!/\.delete\(\)/.test(revokeRoute), "a revoked link keeps its view count, which is the leak signal");
});

test("the public page is outside (app), uncacheable, and says nothing in its preview card", () => {
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /robots: \{ index: false, follow: false/);
  const meta = page.slice(page.indexOf("export const metadata"), page.indexOf("const chip"));
  assert.ok(!/\$\{/.test(meta), "an unfurled card that names the city or the dates is the group chat reading them without opening the link");
  assert.match(meta, /A Trail gift list/);
  const config = read("next.config.ts");
  for (const header of ["no-store, private", "noindex, nofollow, noarchive", "no-referrer"]) assert.ok(config.includes(header), `/s/* is missing ${header}`);
  assert.match(read("public/robots.txt"), /Disallow: \/s\//);
});

test("the service key stays on the server side of the boundary", () => {
  assert.match(sheet, /^"use client";/);
  assert.ok(!/lib\/share\/server/.test(sheet), "a client component must not pull in the module that imports the service key");
  assert.ok(!/supabase\/admin/.test(projection) && !/supabase\/admin/.test(link), "the projection and the token stay pure so this test can hold them");
});

test("the label is Share, and does not promise the membership phase 2 adds", () => {
  assert.match(sheet, /<span>Share<\/span>/);
  assert.ok(!/\+ Invite|coming soon/i.test(code(sheet)), "we do not advertise what is not built");
  assert.match(sheet, /including the gift meant for them/);
});

/** G6 fixed `recipients.priority` and `is_optional` as permanently excluded — nobody opens the
 *  screen where a guest reads that they were ranked fourth. N3 gives those two columns a UI for
 *  the first time, which is the moment the exclusion is most likely to be undone by accident. */
test("N3's tiers never reach a share payload, and neither does the tier vocabulary", () => {
  const shown = JSON.stringify(project(ALL_ON));
  for (const leaked of ["priority", "isOptional", "is_optional", "must", "Must buy", "MUST BUY", "spare", "tier", "If there"]) {
    assert.equal(shown.toLowerCase().includes(leaked.toLowerCase()), false, `${leaked} reached the share payload`);
  }
  // And the projection does not so much as import the module that computes them.
  const source = code(read("lib/share/projection.ts"));
  for (const forbidden of ["budget/priority", "tierOf", "TIER_", "priority", "is_optional"]) assert.equal(source.includes(forbidden), false, forbidden);
});
