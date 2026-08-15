import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { echoTransfer, judgeTransfer, loadTransfer, loadTrip } from "@/lib/transfers/context";
import { adminOrNull, loadItems, recordEligibility } from "@/lib/transfers/server";
import { bagCountOf, parseManifest, planManifest, weightOf, type ManifestInput } from "@/lib/transfers/manifest";

/** The bag manifest: which bags are going to the hotel.
 *
 *  Whole-record replacement, like the purchase routes, so the outbox can replay
 *  it — the shop this is used in has no signal. What makes the replay land on the
 *  same rows instead of doubling the manifest is `planManifest`, which matches by
 *  row id, then purchase id, then label.
 *
 *  Two bags the plan never mentioned are first-class here: `purchase_id` stays
 *  null and the label carries the bag. Weight and handling for a *planned* bag
 *  are taken from the purchase row, never from the body — a client that could
 *  relabel a Chilled box as Standard would walk past both the chilled deadline
 *  and the counter's accepted handling.
 *
 *  Editable only while the transfer is a draft. After confirmation the manifest
 *  is what a partner physically holds, and RLS refuses the write anyway; this
 *  answers 409 so the screen can say why. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type PurchaseLite = { id: string; bags: number; handling: string; unplanned_label: string | null; voided_at: string | null };

export async function PUT(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_transfer_id" }, 400);

  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;
  const parsed = parseManifest(body.body.items);
  if (!parsed.ok) return json({ error: "invalid_field", field: parsed.field }, 400);

  const db = await createClient(), uid = traveler.id;
  const transfer = await loadTransfer(db, id);
  if (!transfer) return json({ error: "transfer_not_found" }, 404);      // RLS answers "not yours" the same way, on purpose
  if (transfer.status !== "draft") return json({ error: "manifest_frozen", status: transfer.status }, 409);

  // Ownership of every purchase is proved by RLS on this read, not by the body.
  const wanted = parsed.items.map((i) => i.purchaseId).filter((p): p is string => Boolean(p));
  const purchases = new Map<string, PurchaseLite>();
  if (wanted.length) {
    const res = await db.from("purchases").select("id, bags, handling, unplanned_label, voided_at").in("id", wanted);
    if (res.error) return json({ error: "purchases_unavailable", detail: res.error.message }, 500);
    for (const row of (res.data ?? []) as PurchaseLite[]) purchases.set(row.id, row);
    for (const purchaseId of wanted) {
      const row = purchases.get(purchaseId);
      if (!row) return json({ error: "purchase_not_found", purchaseId }, 404);
      // A refunded purchase is not a bag anybody is carrying.
      if (row.voided_at) return json({ error: "purchase_voided", purchaseId }, 409);
    }
  }

  const items: ManifestInput[] = parsed.items.map((i) => {
    const row = i.purchaseId ? purchases.get(i.purchaseId) : undefined;
    return row ? { ...i, bags: row.bags, handling: row.handling as ManifestInput["handling"], label: i.label || row.unplanned_label || "Purchased bag" } : i;
  });

  const existing = await loadItems(db, id, uid);
  if (existing.error) return json({ error: "items_unavailable", detail: existing.error.message }, 500);
  const plan = planManifest(existing.items.map((r) => ({ id: r.id, purchase_id: r.purchase_id, label: r.label })), items);

  const columns = (i: ManifestInput) => ({ purchase_id: i.purchaseId, label: i.label, bags: i.bags, handling: i.handling, weight_grams: i.weightGrams });
  // Removals go first: a bag moved from one entry to another must free its
  // (transfer_id, purchase_id) slot before the new row claims it.
  if (plan.remove.length) { const dropped = await db.from("bag_transfer_items").delete().in("id", plan.remove); if (dropped.error) return json({ error: "items_write_failed", detail: dropped.error.message }, 500); }
  for (const { id: rowId, item } of plan.update) { const moved = await db.from("bag_transfer_items").update(columns(item)).eq("id", rowId); if (moved.error) return json({ error: "items_write_failed", detail: moved.error.message }, 500); }
  if (plan.insert.length) { const added = await db.from("bag_transfer_items").insert(plan.insert.map((i) => ({ ...columns(i), transfer_id: id, user_id: uid }))); if (added.error) return json({ error: "items_write_failed", detail: added.error.message }, 500); }

  // Only the two columns a traveler may still write. bag_count and fee_cents are
  // frozen by /confirm — the manifest decides them, but it does not write them.
  const declared = weightOf(items);
  if (declared !== transfer.weight_grams) await db.from("bag_transfers").update({ weight_grams: declared }).eq("id", id);

  const trip = await loadTrip(db, transfer.trip_id);
  if (!trip) return json({ error: "trip_not_found" }, 404);
  const fresh = await loadItems(db, id, uid);
  const judgement = await judgeTransfer(db, { transfer: { ...transfer, weight_grams: declared }, trip, items: fresh.items });
  await recordEligibility(adminOrNull(), transfer, judgement.eligibility);

  return echoTransfer(db, { userId: uid, email: traveler.email ?? "", tripId: transfer.trip_id, transferId: id }, { eligibility: judgement.eligibility, quote: judgement.quote, bagCount: bagCountOf(items) });
}
