import { json, MAX_BODY } from "@/lib/api/http";
import { adminOrNull, partnerAuthorised, passSecret, loadItems } from "@/lib/transfers/server";
import { constantTimeEqual, issueScanSession, sha256Hex, verifyPass } from "@/lib/transfers/pass";
import { TRANSFER_SELECT, type TransferRowLite } from "@/lib/transfers/context";

/** The counter side of the QR: what a partner terminal learns from a scan.
 *
 *  Checks run in this order and stop at the first failure:
 *    1. the partner credential — with none configured the route answers 404, not
 *       403. An endpoint that cannot be used should not announce that it exists.
 *    2. the signature, so a forged token never reaches the database.
 *    3. the expiry.
 *    4. the stored hash, compared in constant time, which is what makes a
 *       reissued pass revoke the one before it.
 *
 *  What comes back is what the counter needs to take the bags and nothing else:
 *  a reference code, the bag list, the hotel the run goes to. No traveler name,
 *  no email, no amount. Custody is not moved by scanning — that is an event, and
 *  it is written by the drop-off call, not by looking.
 *
 *  Cookies are not involved, so there is no same-origin check: the credential is
 *  the shared partner key, and a terminal is not a browser. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = passSecret(), admin = adminOrNull();
  if (!partnerAuthorised(request) || !secret || !admin) return json({ error: "not_found" }, 404);

  let raw: string;
  try { raw = await request.text(); } catch { return json({ error: "unreadable" }, 400); }
  if (raw.length > MAX_BODY) return json({ error: "payload_too_large" }, 413);
  let body: { token?: unknown };
  try { body = JSON.parse(raw || "{}") as { token?: unknown }; } catch { return json({ error: "unreadable" }, 400); }
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return json({ error: "invalid_field", field: "token" }, 400);

  const now = new Date();
  const signature = await verifyPass(token, secret, now);
  if (!signature.ok) return json({ error: signature.reason }, signature.reason === "pass_expired" ? 410 : 401);

  const found = await admin.from("bag_transfers").select(`${TRANSFER_SELECT}, pass_token_hash`).eq("id", signature.payload.t).maybeSingle();
  const transfer = (found.data as (TransferRowLite & { pass_token_hash: string | null }) | null) ?? null;
  if (!transfer) return json({ error: "pass_replaced" }, 401);         // the same answer as a stale token: a scanner learns nothing either way
  if (!transfer.pass_token_hash || !constantTimeEqual(await sha256Hex(token), transfer.pass_token_hash)) return json({ error: "pass_replaced" }, 401);

  const { items } = await loadItems(admin, transfer.id, transfer.user_id);
  const session = await issueScanSession(transfer.id, signature.payload.j, now, secret);

  return json({
    transferId: transfer.id, referenceCode: transfer.reference_code, status: transfer.status,
    paid: transfer.status === "paid", hotelName: transfer.hotel_name, bagCount: transfer.bag_count,
    dropoffCutoffAt: transfer.dropoff_cutoff_at, source: transfer.source,
    items: items.map((i) => ({ id: i.id, label: i.label, bags: i.bags, handling: i.handling, sealId: i.seal_id, sealedAt: i.sealed_at })),
    scanToken: session.token, scanExpiresAt: session.expiresAt,
  }, 200);
}
