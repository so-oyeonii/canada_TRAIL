import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, oneOf, readBody, UUID } from "@/lib/api/http";
import { echoTransfer, loadTransfer } from "@/lib/transfers/context";
import { adminOrNull, attachSeals, handoffTransfer, insertEvent, loadItems, simulatorOn } from "@/lib/transfers/server";
import { nextSimulatedEvent } from "@/lib/transfers/custody";

/** The partner terminal and the driver app that do not exist yet.
 *
 *  Three locks, all of which have to be open: `TRAIL_SIMULATOR=on`, a transfer
 *  whose `source` is `simulated`, and a service key. Anything else is a 404 —
 *  including a `sample` or `live` row, so switching a real partner API on does
 *  not require deleting this file, only leaving the flag off.
 *
 *  It writes the same events the real integration will, through the same
 *  functions: seals come out of `seal_tags` stock, the handoff is a set
 *  comparison of tag ids, the receipt is written by `handoffTransfer`. The two
 *  failure branches are reachable on purpose — a delivery that can only succeed
 *  is not a delivery anybody tested. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const FAILURES = ["tag_mismatch", "front_desk_refused"] as const;

export async function POST(request: Request, ctx: Ctx) {
  if (!simulatorOn()) return json({ error: "not_found" }, 404);
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_transfer_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const fail = body.body.fail === undefined || body.body.fail === null ? null : oneOf(body.body.fail, FAILURES);
  if (body.body.fail !== undefined && body.body.fail !== null && !fail) return json({ error: "invalid_field", field: "fail", allowed: FAILURES }, 400);

  const db = await createClient(), uid = traveler.id, admin = adminOrNull();
  const transfer = await loadTransfer(db, id);
  if (!transfer || transfer.source !== "simulated" || !admin) return json({ error: "not_found" }, 404);

  const last = await db.from("transfer_events").select("event_type").eq("transfer_id", id).order("seq", { ascending: false }).limit(1).maybeSingle();
  const step = nextSimulatedEvent(transfer.status, (last.data?.event_type as Parameters<typeof nextSimulatedEvent>[1]) ?? null);
  if (!step) return json({ error: "nothing_to_advance", status: transfer.status }, 409);

  const who = { userId: uid, email: traveler.email ?? "", tripId: transfer.trip_id, transferId: id };

  // Collection is the first moment a tag is physically on a bag, so the stock
  // moves here and each tag gets its own `sealed` row. Handoff compares this set.
  if (step.eventType === "collected") {
    const before = await loadItems(admin, id, uid);
    const sealed = await attachSeals(admin, transfer.dropoff_store_id, before.items);
    for (const { itemId, sealId } of sealed.attached) await insertEvent(admin, { transferId: id, userId: uid, eventType: "sealed", actor: "partner", itemId, payload: { sealId } });
    if (sealed.short > 0 && !sealed.attached.length) return json({ error: "no_seal_stock" }, 409);
  }

  if (step.eventType === "handed_off") {
    if (fail === "front_desk_refused") {
      const declined = await insertEvent(admin, { transferId: id, userId: uid, eventType: "declined", actor: "hotel", payload: { code: "front_desk_refused" } });
      if (declined.error) return json({ error: "event_write_failed", detail: declined.error.message }, 500);
      await admin.from("bag_transfers").update({ handoff_failure_code: "front_desk_refused" }).eq("id", id).eq("user_id", uid);
      return echoTransfer(db, who, { outcome: "front_desk_refused" }, 409);
    }
    const { items } = await loadItems(admin, id, uid);
    const seals = items.map((i) => i.seal_id).filter((s): s is string => Boolean(s));
    // One tag short is how a bag goes missing in the real world: the count still
    // looks plausible and the set does not match.
    const scanned = fail === "tag_mismatch" ? seals.slice(1) : seals;
    const handoff = await handoffTransfer(admin, { id, user_id: uid, fee_cents: transfer.fee_cents }, scanned, "Front desk (simulated)");
    return echoTransfer(db, who, handoff.ok ? { outcome: "handed_off", ...handoff.body } : { outcome: "tag_mismatch", ...handoff.body }, handoff.status);
  }

  const written = await insertEvent(admin, { transferId: id, userId: uid, eventType: step.eventType, actor: step.actor, location: step.eventType === "collected" ? "Partner counter (simulated)" : null });
  if (written.error) return json({ error: "event_write_failed", detail: written.error.message }, 500);
  return echoTransfer(db, who, { outcome: step.eventType, event: written.event }, 201);
}
