import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { adminOrNull } from "@/lib/share/server";

/** Revoking a link.
 *
 *  A row, not a delete: `revoked_at` is set and the row stays, because `view_count` after
 *  the fact is how a traveller finds out a link had spread further than they sent it.
 *
 *  Changing what a link shows is revoke-then-create, and there is no PATCH for it. Editing
 *  the scope in place would leave a URL already sitting in a group chat quietly showing
 *  more than it did yesterday; this way the old link stops working the moment the owner
 *  decides it should, and the new one is a new URL they have to choose to send. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ tripId: string; shareId: string }> };

export async function DELETE(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { tripId, shareId } = await ctx.params;
  if (!UUID.test(tripId) || !UUID.test(shareId)) return json({ error: "bad_share_id" }, 400);
  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  // Read it back on the traveller's own session first, so RLS answers "not yours" as
  // "not found" before the service key is ever picked up.
  const db = await createClient();
  const mine = await db.from("trip_shares").select("id").eq("id", shareId).eq("trip_id", tripId).maybeSingle();
  if (mine.error) return json({ error: "share_unavailable", detail: mine.error.message }, 503);
  if (!mine.data) return json({ error: "share_not_found" }, 404);

  const admin = adminOrNull();
  if (!admin) return json({ error: "share_unavailable" }, 503);

  // Idempotent: revoking twice keeps the first timestamp, which is the one that is true.
  const written = await admin.from("trip_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId).eq("user_id", traveler.id).is("revoked_at", null).select("id").maybeSingle();
  if (written.error) return json({ error: "revoke_failed", detail: written.error.message }, 500);
  return json({ shareId, revoked: true }, 200);
}
