/** Turning a token into a screen. Server only — this file reaches for the service key.
 *
 *  A guest has no session, so RLS cannot be what scopes this read; the token is. That
 *  makes the order of the checks the whole security argument, and it is the same order the
 *  drop-off pass uses: **signature → payload expiry → row → revoked → expires → stored
 *  hash, in constant time.** A forged token never reaches the database, so this endpoint
 *  cannot be used to find out which trip ids exist.
 *
 *  Every refusal comes back as `gone`. Expired, revoked, forged, trip deleted, key not
 *  configured — one reason, one screen, one status code. "This link was revoked" is a
 *  sentence that confirms the trip exists and that somebody thought better of sharing it.
 *
 *  Nothing here ever logs the token. `share_id` is enough to find a row, and a token in a
 *  log line is a working link sitting in a log aggregator. */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasAdminClient } from "../supabase/admin.ts";
import { verifyShareToken } from "./link.ts";
import { projectShare, type ShareRecipientRow, type ShareStopRow, type SharedTrip } from "./projection.ts";
import { scopeOf, type ShareScopeColumns } from "./scope.ts";

export const shareSecret = () => process.env.TRAIL_SHARE_SIGNING_KEY ?? null;
export const adminOrNull = (): SupabaseClient | null => (hasAdminClient() ? createAdminClient() : null);

export const SHARE_COLUMNS = "id, trip_id, user_id, label, scope_recipients, scope_prices, scope_dates, scope_delivery, issued_at, expires_at, revoked_at, view_count, last_viewed_at";
type ShareRow = ShareScopeColumns & { id: string; trip_id: string; user_id: string; token_hash: string; expires_at: string; revoked_at: string | null };

export type ShareLoad = { ok: true; shareId: string; view: SharedTrip } | { ok: false; reason: "gone" };

export async function loadSharedTrip(token: string, now = new Date()): Promise<ShareLoad> {
  const secret = shareSecret(), admin = adminOrNull();
  // A link nobody can verify is a link that must not open. Logged, because this is a
  // deployment fault and not a visitor's.
  if (!secret || !admin) { console.error("[share] TRAIL_SHARE_SIGNING_KEY or the service key is missing — every link answers gone"); return { ok: false, reason: "gone" }; }

  const signed = await verifyShareToken(token, secret, now);
  if (!signed.ok) return { ok: false, reason: "gone" };            // never touched the database

  const found = await admin.from("trip_shares").select(`${SHARE_COLUMNS}, token_hash`).eq("id", signed.payload.s).maybeSingle();
  const share = found.data as ShareRow | null;
  if (found.error || !share || share.trip_id !== signed.payload.t) return { ok: false, reason: "gone" };
  if (share.revoked_at || Date.parse(share.expires_at) <= now.getTime()) return { ok: false, reason: "gone" };

  const sealed = await verifyShareToken(token, secret, now, share.token_hash);
  if (!sealed.ok) return { ok: false, reason: "gone" };

  const scope = scopeOf(share);
  // Explicit columns everywhere, deliberately. `select *` here would put every future
  // column one careless spread away from a guest's screen; the whitelist in
  // projection.ts is the second layer, not the only one.
  const [owner, trip] = await Promise.all([
    admin.from("app_users").select("display_name").eq("id", share.user_id).maybeSingle(),
    admin.from("trips").select("city, country, status, start_date, end_date, currency").eq("id", share.trip_id).eq("user_id", share.user_id).maybeSingle(),
  ]);
  if (!trip.data) return { ok: false, reason: "gone" };            // trip archived away or deleted under the link

  const [plan, recipients, stops, transfer] = await Promise.all([
    admin.from("plans").select("category, preference, total_cents, planned_cents").eq("trip_id", share.trip_id).eq("user_id", share.user_id).order("version", { ascending: false }).limit(1).maybeSingle(),
    scope.recipients
      ? admin.from("recipients").select("id, name, group_size, is_self").eq("trip_id", share.trip_id).eq("user_id", share.user_id).is("archived_at", null).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as ShareRecipientRow[] }),
    // Ordered by the day and the sequence, which are never *shown*: the list reads in the
    // order it will be walked without publishing the timetable that decides it.
    admin.from("stops").select("recipient_id, product_name, store_name, area, status, handling, snapshot_price_cents, source").eq("trip_id", share.trip_id).eq("user_id", share.user_id).order("planned_day", { ascending: true }).order("sequence", { ascending: true }),
    scope.delivery
      ? admin.from("bag_transfers").select("status, bag_count, source").eq("trip_id", share.trip_id).eq("user_id", share.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const view = projectShare({
    owner: owner.data ?? null,
    trip: trip.data,
    plan: plan.data ?? null,
    recipients: (recipients.data ?? []) as ShareRecipientRow[],
    stops: (stops.data ?? []) as ShareStopRow[],
    transfer: transfer.data ?? null,
    scope,
  });

  await admin.rpc("record_share_view", { p_share_id: share.id });
  return { ok: true, shareId: share.id, view };
}
