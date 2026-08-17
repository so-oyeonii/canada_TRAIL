import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody } from "@/lib/api/http";
import { parseTripCreate, toMinorUnits } from "@/lib/trips/input";
import { splitBudget, QUOTE_BAGS } from "@/app/onboarding/budget";
import { loadPricing } from "@/lib/transfers/context";
import { quoteFee } from "@/lib/transfers/clock";
import { MINOR_UNITS } from "@/app/trail-brief";

/** Registering the first trip, and the wallet that comes with it.
 *
 *  The browser used to write both rows itself. It cannot any more: a client that
 *  may INSERT a plan may also set `status = 'approved'` on one, and the whole
 *  product rests on the traveller being the only one who approves anything.
 *
 *  Two numbers are decided here rather than accepted:
 *
 *  - **the delivery reserve**, quoted from `delivery_pricing` for the city being
 *    registered. The form shows the same quote, but showing is not deciding.
 *  - **the three buckets**, split so they add up in cents. `plans_buckets_sum`
 *    would refuse anything else, and a refused insert is a trip with no wallet.
 *
 *  A plan that fails to write takes its trip with it. Half a trip is worse than
 *  none: every screen downstream reads "a trip exists" as "a budget exists". */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const parsed = parseTripCreate(body.body);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field, reason: parsed.reason }, 400);
  const trip = parsed.value;

  const db = await createClient();
  // The fee is quoted per city in the price list's own currency; there is no FX
  // table, so it is carried across as a unit count rather than converted.
  const quote = quoteFee(await loadPricing(db, trip.city, new Date()), QUOTE_BAGS);
  const reserveUnits = quote.feeCents / (MINOR_UNITS[quote.currency] ?? 100);
  const buckets = splitBudget(parsed.totalUnits, reserveUnits);

  const written = await db.from("trips").insert({ ...trip, user_id: traveler.id, status: "planning" }).select("id").maybeSingle();
  if (written.error || !written.data) return json({ error: "trip_write_failed", detail: written.error?.message ?? "no row" }, 500);
  const tripId = written.data.id as string;

  const plan = await db.from("plans").insert({
    trip_id: tripId, user_id: traveler.id, status: "draft",
    total_cents: toMinorUnits(buckets.total, trip.currency),
    planned_cents: toMinorUnits(buckets.planned, trip.currency),
    delivery_reserve_cents: toMinorUnits(buckets.reserve, trip.currency),
    flexible_cents: toMinorUnits(buckets.flexible, trip.currency),
  }).select("id").maybeSingle();

  if (plan.error || !plan.data) {
    await db.from("trips").delete().eq("id", tripId);
    return json({ error: "plan_write_failed", detail: plan.error?.message ?? "no row" }, 500);
  }

  return json({ tripId, planId: plan.data.id as string, buckets, reserveSource: quote.currency }, 201);
}
