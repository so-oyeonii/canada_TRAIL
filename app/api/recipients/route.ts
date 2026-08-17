import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, readBody, UUID } from "@/lib/api/http";
import { parseRecipientCreate } from "@/lib/recipients/input";
import { echoBudget, resolveTripId } from "@/lib/recipients/server";

/** Adding someone to shop for.
 *
 *  The trip is resolved by the server: `tripId` is optional and, when it is sent,
 *  it still has to come back through RLS before anything is written to it. No
 *  body may name a user — `readBody` refuses one outright.
 *
 *  "Myself" is one person per trip and the database says so
 *  (`recipients_one_self_per_trip`). A second one is a 409 rather than a silent
 *  demotion of the first, because which of the two is really the traveller is not
 *  a question this route gets to answer. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const asked = body.body.tripId === undefined || body.body.tripId === null ? null : asString(body.body.tripId, 40);
  if (body.body.tripId !== undefined && body.body.tripId !== null && (!asked || !UUID.test(asked))) return json({ error: "invalid_field", field: "tripId" }, 400);

  const parsed = parseRecipientCreate(body.body);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field, reason: parsed.reason }, 400);

  const db = await createClient();
  const tripId = await resolveTripId(db, asked);
  if (!tripId) return json({ error: "trip_not_found" }, 404);

  const written = await db.from("recipients").insert({ ...parsed.value, trip_id: tripId, user_id: traveler.id }).select("id").maybeSingle();
  if (written.error?.code === "23505") return json({ error: "self_already_exists", field: "isSelf" }, 409);
  if (written.error) return json({ error: "recipient_write_failed", detail: written.error.message }, 500);

  return echoBudget(db, traveler.id, traveler.email ?? "", tripId, { recipientId: written.data?.id ?? null }, 201);
}
