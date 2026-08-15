import { createClient, getTraveler } from "@/lib/supabase/server";
import { asString, json, oneOf, readBody, UUID } from "@/lib/api/http";
import { echoTransfer, loadTransfer } from "@/lib/transfers/context";
import { insertEvent } from "@/lib/transfers/server";
import type { IssueKind } from "@/lib/state/types";

/** "Something is wrong with my bags."
 *
 *  A report is not a status. Filing one does not move the delivery, and the
 *  traveler cannot mark it resolved either — `transfer_issues` has no UPDATE
 *  grant, because whether it is being looked at is an operations claim.
 *
 *  Two of the six kinds are also events the traveler is entitled to write, so
 *  they are written as both: the report carries the description and the photos,
 *  the ledger carries the fact, and `event_id` ties them together. Filing the
 *  report without the event would leave the timeline silent about a delay the
 *  traveler had already told us about. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const KINDS: readonly IssueKind[] = ["delay", "broken_seal", "missing_bag", "damaged_contents", "wrong_hotel", "other"];
const AS_EVENT = { delay: "delayed", broken_seal: "seal_issue" } as const;
const MAX_PHOTOS = 6;

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_transfer_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const kind = oneOf(body.body.kind, KINDS);
  if (!kind) return json({ error: "invalid_field", field: "kind", allowed: KINDS }, 400);
  const description = asString(body.body.description, 1000) ?? "";
  const clientOpId = asString(body.body.clientOpId, 120);

  // Storage paths, not images: the upload is a separate signed call, and a route
  // that accepted bytes here would put photos of somebody's luggage in a JSON body.
  const rawPhotos = body.body.photoPaths ?? [];
  if (!Array.isArray(rawPhotos) || rawPhotos.length > MAX_PHOTOS) return json({ error: "invalid_field", field: "photoPaths" }, 400);
  const photoPaths: string[] = [];
  for (const path of rawPhotos) { const value = asString(path, 300); if (!value) return json({ error: "invalid_field", field: "photoPaths" }, 400); photoPaths.push(value); }

  const db = await createClient(), uid = traveler.id;
  const transfer = await loadTransfer(db, id);
  if (!transfer) return json({ error: "transfer_not_found" }, 404);

  const eventType = AS_EVENT[kind as keyof typeof AS_EVENT] ?? null;
  let eventId: string | null = null;
  if (eventType) {
    const event = await insertEvent(db, { transferId: id, userId: uid, eventType, actor: "traveler", note: description.slice(0, 500) || null, payload: { issueKind: kind }, clientEventId: clientOpId ? `issue:${clientOpId}` : null });
    if (event.error) return json({ error: "event_write_failed", detail: event.error.message }, 500);
    eventId = (event.event as { id: string } | null)?.id ?? null;
  }

  const row = { transfer_id: id, user_id: uid, kind, description, photo_paths: photoPaths, event_id: eventId, client_op_id: clientOpId };
  const written = await db.from("transfer_issues").insert(row).select("id, kind, status, description, reported_at, resolved_at").maybeSingle();
  // A second tap in a corridor with no signal is the same report, not a second one.
  if (written.error && written.error.code !== "23505") return json({ error: "issue_write_failed", detail: written.error.message }, 500);
  const replayed = Boolean(written.error);
  const issue = replayed && clientOpId
    ? (await db.from("transfer_issues").select("id, kind, status, description, reported_at, resolved_at").eq("transfer_id", id).eq("client_op_id", clientOpId).maybeSingle()).data
    : written.data;

  return echoTransfer(db, { userId: uid, email: traveler.email ?? "", tripId: transfer.trip_id, transferId: id }, { issue, replayed }, replayed ? 200 : 201);
}
