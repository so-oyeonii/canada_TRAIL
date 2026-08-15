import { createClient, getTraveler } from "@/lib/supabase/server";
import { json, readBody, UUID } from "@/lib/api/http";
import { loadTransfer } from "@/lib/transfers/context";
import { adminOrNull, passSecret } from "@/lib/transfers/server";
import { issuePass } from "@/lib/transfers/pass";
import { TERMINAL } from "@/lib/transfers/custody";

/** The drop-off pass, issued once and cached on the phone.
 *
 *  The counter is in a basement, so the traveler has to be able to show this
 *  with no signal — which is why it is a signed token and not a lookup. The
 *  database keeps `sha256(token)` and never the token itself: reissuing changes
 *  the hash, and that alone revokes the previous pass without a revocation list.
 *
 *  Because only the hash is stored, the token cannot be handed out twice. Every
 *  POST issues a new one and bumps `pass_version`; a traveler who lost their
 *  phone gets a new pass and the old QR stops working the moment they do.
 *
 *  The payload carries no name, no hotel and no amount — one uuid and a bag
 *  count. Somebody photographing the QR over a shoulder learns nothing. */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const traveler = await getTraveler();
  if (!traveler) return json({ error: "unauthenticated" }, 401);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "bad_transfer_id" }, 400);
  const body = await readBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const secret = passSecret(), admin = adminOrNull();
  // A pass nobody can verify is worse than no pass: it would be shown at a
  // counter and refused there instead of here.
  if (!secret || !admin) return json({ error: "pass_unavailable" }, 503);

  const db = await createClient(), uid = traveler.id;
  const transfer = await loadTransfer(db, id);
  if (!transfer) return json({ error: "transfer_not_found" }, 404);
  if (TERMINAL.includes(transfer.status) || transfer.status === "failed") return json({ error: "transfer_closed", status: transfer.status }, 409);
  if (!transfer.confirmed_at) return json({ error: "not_confirmed" }, 409);

  const issuedAt = new Date();
  const cutoffAt = transfer.dropoff_cutoff_at ? new Date(transfer.dropoff_cutoff_at) : null;
  const pass = await issuePass({ transferId: id, jti: crypto.randomUUID(), issuedAt, cutoffAt, bagCount: transfer.bag_count, secret });
  const version = (transfer.pass_version ?? 0) + 1;

  const written = await admin.from("bag_transfers").update({ pass_token_hash: pass.tokenHash, pass_issued_at: pass.issuedAt, pass_expires_at: pass.expiresAt, pass_version: version }).eq("id", id).eq("user_id", uid).select("id").maybeSingle();
  if (written.error || !written.data) return json({ error: "pass_write_failed", detail: written.error?.message ?? "no row" }, 500);

  return json({ token: pass.token, expiresAt: pass.expiresAt, issuedAt: pass.issuedAt, version, referenceCode: transfer.reference_code, bagCount: transfer.bag_count, status: transfer.status }, 201);
}
