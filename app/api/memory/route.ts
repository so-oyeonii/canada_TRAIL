import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, oneOf, readBody, UUID } from "@/lib/api/http";

/** `TRAIL REMEMBERS` — the Yes/Keep tap, written down.
 *
 *  One row per thing remembered, with `consented_at` from the server clock. A browser does
 *  not get to say when consent was given: that timestamp is the record of a decision, and
 *  a client-supplied one is a claim rather than a fact.
 *
 *  Forgetting is `revoked_at`, not a DELETE. What was remembered and when it stopped being
 *  used are two different facts and the traveller may need both. */
export const dynamic = "force-dynamic";

const KINDS = ["avoid", "prefer"] as const;
const SELECT = "id, kind, value, source_trip_id, consented_at";

export async function GET() {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const db = await createClient();
  const rows = await db.from("memory_constraints").select(SELECT).is("revoked_at", null).order("consented_at", { ascending: false }).limit(20);
  if (rows.error) return json({ error: "memory_unavailable", detail: rows.error.message }, 500);
  return json({ constraints: (rows.data ?? []).map((row) => { const r = row as { id: string; kind: string; value: string; source_trip_id: string | null; consented_at: string }; return { id: r.id, kind: r.kind, value: r.value, sourceTripId: r.source_trip_id, consentedAt: r.consented_at }; }) }, 200);
}

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const kind = oneOf(body.body.kind, KINDS);
  if (!kind) return json({ error: "invalid_field", field: "kind" }, 400);
  const value = (asString(body.body.value, 120) ?? "").replace(/\s+/g, " ").trim();
  if (!value) return json({ error: "invalid_field", field: "value" }, 400);
  const tripId = asString(body.body.tripId, 40);
  if (tripId && !UUID.test(tripId)) return json({ error: "invalid_field", field: "tripId" }, 400);

  const db = await createClient();
  // `consented_at` is left to the column default, which is `now()` on the database.
  const written = await db.from("memory_constraints").insert({ user_id: traveler.id, kind, value, trip_id: tripId, source_trip_id: tripId }).select(SELECT).maybeSingle();
  if (written.error) return json({ error: "memory_write_failed", detail: written.error.message }, 500);
  const row = written.data as { id: string; kind: string; value: string; source_trip_id: string | null; consented_at: string } | null;
  return json({ constraint: row ? { id: row.id, kind: row.kind, value: row.value, sourceTripId: row.source_trip_id, consentedAt: row.consented_at } : null }, 201);
}
