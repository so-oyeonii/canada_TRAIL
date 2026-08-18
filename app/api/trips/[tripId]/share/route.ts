import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, readBody, UUID } from "@/lib/api/http";
import { issueShareLink } from "@/lib/share/link";
import { adminOrNull, shareSecret } from "@/lib/share/server";
import { parseShareScope, scopeColumns, shareRow, SHARE_LINK_LIMIT } from "@/lib/share/scope";

/** Listing and issuing read-only share links.
 *
 *  The split of clients here is the point. The **list** runs on the traveller's own
 *  session, so RLS is what proves the rows are theirs and 0026's SELECT grant is all the
 *  browser ever needs. **Issuing** runs on the service key, because 0026 gives
 *  `authenticated` no INSERT: a browser that could write this table could write its own
 *  `expires_at`, and an expiry the client chooses is not an expiry.
 *
 *  Ownership of the trip is checked by reading it back through the traveller's session
 *  first. Somebody else's trip id therefore answers 404 and not 403 — a 403 would confirm
 *  the id belongs to someone.
 *
 *  The token is returned exactly once, here, and never stored. There is no route that can
 *  show it again, because the database only ever had its sha256. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ tripId: string }> };

const LIST_COLUMNS = "id, label, scope_recipients, scope_prices, scope_dates, scope_delivery, issued_at, expires_at, revoked_at, view_count, last_viewed_at";
const origin = (request: Request) => { const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000"; return `${request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`; };

async function activeShares(db: Awaited<ReturnType<typeof createClient>>, tripId: string) {
  return db.from("trip_shares").select(LIST_COLUMNS).eq("trip_id", tripId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
}

export async function GET(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { tripId } = await ctx.params;
  if (!UUID.test(tripId)) return json({ error: "bad_trip_id" }, 400);

  const db = await createClient();
  const rows = await activeShares(db, tripId);
  // 0026 not applied yet: the sheet says so rather than showing an empty list that looks
  // like "you have never shared this".
  if (rows.error) return json({ error: /does not exist/i.test(rows.error.message) ? "share_unavailable" : "share_read_failed", detail: rows.error.message }, rows.error.code === "42P01" ? 503 : 500);
  return json({ shares: (rows.data ?? []).map(shareRow), limit: SHARE_LINK_LIMIT }, 200);
}

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { tripId } = await ctx.params;
  if (!UUID.test(tripId)) return json({ error: "bad_trip_id" }, 400);
  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const db = await createClient();
  const trip = await db.from("trips").select("id, end_date").eq("id", tripId).maybeSingle();
  if (!trip.data) return json({ error: "trip_not_found" }, 404);

  const existing = await activeShares(db, tripId);
  if (existing.error) return json({ error: "share_unavailable", detail: existing.error.message }, 503);
  // Three at a time. A fourth is a refusal with a name, not a silent revoke of the oldest:
  // deciding which of the traveller's links dies is not ours to do quietly.
  if ((existing.data ?? []).length >= SHARE_LINK_LIMIT) return json({ error: "too_many_links", limit: SHARE_LINK_LIMIT }, 409);

  const secret = shareSecret(), admin = adminOrNull();
  if (!secret || !admin) return json({ error: "share_unavailable" }, 503);

  const scope = parseShareScope(body.body.scope);
  const shareId = crypto.randomUUID();
  const issued = await issueShareLink({ tripId, shareId, issuedAt: new Date(), endDate: (trip.data as { end_date: string | null }).end_date, secret });
  if (issued.expired) return json({ error: "trip_ended" }, 409);

  const written = await admin.from("trip_shares").insert({ id: shareId, trip_id: tripId, user_id: traveler.id, label: asString(body.body.label, 40)?.trim() ?? "", token_hash: issued.tokenHash, issued_at: issued.issuedAt, expires_at: issued.expiresAt, ...scopeColumns(scope) }).select(LIST_COLUMNS).maybeSingle();
  if (written.error || !written.data) return json({ error: "share_write_failed", detail: written.error?.message ?? "no row" }, 500);

  // The only time this URL exists. Nothing logs it, and no later request can rebuild it.
  return json({ share: shareRow(written.data), url: `${origin(request)}/s/${issued.token}` }, 201);
}
