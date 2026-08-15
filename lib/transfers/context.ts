/** Everything the transfer routes have to read before they may decide anything.
 *
 *  The refusal codes in `eligibility.ts` are pure functions over rows, and this
 *  is where the rows come from: the partner counter and its cutoff resolved in
 *  the store's own zone, the hotel's delivery policy, the price list, the
 *  reserve in the plan, the bags actually on the manifest. Nothing is passed in
 *  from the client except which transfer to look at.
 *
 *  All of it goes through the *session* client, so RLS is what proves the rows
 *  belong to the caller. The admin client appears only where a column is
 *  server-owned, and never in this file. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataSource, Handling, IneligibleCode, TransferStatus } from "../state/types";
import { json } from "../api/http.ts";
import { loadTrailState } from "../state/load.ts";
import { chilledDeadline, cutoffInstant, pickPricing, quoteFee, type PricingRow } from "./clock.ts";
import { judgeEligibility, type Eligibility, type EligibilityHotel, type EligibilityItem } from "./eligibility.ts";
import { loadItems, type ItemRow } from "./server.ts";

export const TRANSFER_SELECT = "id, trip_id, user_id, status, reference_code, dropoff_store_id, hotel_name, hotel_address, bag_count, weight_grams, fee_cents, currency, eta_start, eta_end, dropoff_cutoff_at, confirmed_at, delivered_at, ineligible_code, pass_expires_at, pass_version, source, created_at";
export const STORE_SELECT = "id, name, address, area, lat, lng, is_partner_point, dropoff_opens, dropoff_cutoff, accepted_handling, max_weight_grams, daily_capacity, timezone, partner_note, source";
export const OPEN_STATUS: TransferStatus[] = ["draft", "awaiting_payment"];

export type TransferRowLite = { id: string; trip_id: string; user_id: string; status: TransferStatus; reference_code: string; dropoff_store_id: string | null; hotel_name: string; hotel_address: string; bag_count: number; weight_grams: number | null; fee_cents: number; currency: string; eta_start: string | null; eta_end: string | null; dropoff_cutoff_at: string | null; confirmed_at: string | null; delivered_at: string | null; ineligible_code: IneligibleCode | null; pass_expires_at: string | null; pass_version: number | null; source: DataSource; created_at: string };
export type StoreRowLite = { id: string; name: string; address: string; area: string; lat: number | null; lng: number | null; is_partner_point: boolean; dropoff_opens: string | null; dropoff_cutoff: string | null; accepted_handling: Handling[] | null; max_weight_grams: number | null; daily_capacity: number | null; timezone: string | null; partner_note: string | null; source: DataSource };
export type TripLite = { id: string; city: string; hotel_id: string | null; hotel_name: string; hotel_address: string; hotel_verified_at: string | null; currency: string };
export type PlanLite = { id: string; reserveCents: number; flexibleCents: number };

export async function loadTransfer(db: SupabaseClient, id: string): Promise<TransferRowLite | null> {
  const res = await db.from("bag_transfers").select(TRANSFER_SELECT).eq("id", id).maybeSingle();
  return (res.data as TransferRowLite | null) ?? null;
}

export async function loadTrip(db: SupabaseClient, id: string): Promise<TripLite | null> {
  const res = await db.from("trips").select("id, city, hotel_id, hotel_name, hotel_address, hotel_verified_at, currency").eq("id", id).maybeSingle();
  return (res.data as TripLite | null) ?? null;
}

/** Which trip a write belongs to: the one named, else the active one, else the
 *  most recently touched. Onboarding still leaves trips as `planning`, so the
 *  last fallback is what keeps a brand-new account from 404ing. */
export async function resolveTripId(db: SupabaseClient, asked: string | null): Promise<string | null> {
  if (asked) return ((await db.from("trips").select("id").eq("id", asked).maybeSingle()).data?.id as string | undefined) ?? null;
  const active = await db.from("trips").select("id").eq("status", "active").limit(1).maybeSingle();
  if (active.data?.id) return active.data.id as string;
  const newest = await db.from("trips").select("id").neq("status", "archived").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (newest.data?.id as string | undefined) ?? null;
}

/** The approved plan if there is one, else the newest live draft — the same rule
 *  `shape.ts` uses, because the reserve shown on screen has to be the reserve the
 *  eligibility check spends against. */
export async function loadPlan(db: SupabaseClient, tripId: string): Promise<PlanLite | null> {
  const res = await db.from("plans").select("id, status, version, delivery_reserve_cents, flexible_cents").eq("trip_id", tripId).neq("status", "superseded");
  const rows = (res.data ?? []) as { id: string; status: string; version: number; delivery_reserve_cents: number; flexible_cents: number }[];
  const pick = rows.slice().sort((a, b) => (a.status === b.status ? b.version - a.version : a.status === "approved" ? -1 : 1))[0];
  return pick ? { id: pick.id, reserveCents: pick.delivery_reserve_cents, flexibleCents: pick.flexible_cents } : null;
}

export async function loadStore(db: SupabaseClient, storeId: string | null): Promise<StoreRowLite | null> {
  if (!storeId) return null;
  const res = await db.from("stores").select(STORE_SELECT).eq("id", storeId).maybeSingle();
  return (res.data as StoreRowLite | null) ?? null;
}

export async function countPartners(db: SupabaseClient, city: string): Promise<number> {
  const res = await db.from("stores").select("id", { count: "exact", head: true }).eq("city", city).eq("is_partner_point", true);
  return res.count ?? 0;
}

export async function loadPricing(db: SupabaseClient, city: string, now: Date): Promise<PricingRow | null> {
  const res = await db.from("delivery_pricing").select("base_cents, included_bags, extra_bag_cents, currency, effective_from").eq("city", city);
  return pickPricing((res.data ?? []) as (PricingRow & { effective_from: string })[], now);
}

/** Whether the hotel takes third-party deliveries.
 *
 *  A trip linked to a `hotels` row answers from that row. A hotel typed as free
 *  text is matched by name in the same city, and if it is not on the list the
 *  answer is "unknown, not refused" — refusing every unlisted hotel would make
 *  delivery impossible for most travelers, and `verified: false` is what the
 *  screen shows instead of claiming the hotel agreed. */
export async function resolveHotel(db: SupabaseClient, trip: TripLite): Promise<EligibilityHotel> {
  if (trip.hotel_id) {
    const row = await db.from("hotels").select("name, accepts_delivery").eq("id", trip.hotel_id).maybeSingle();
    if (row.data) return { name: row.data.name as string, acceptsDelivery: Boolean(row.data.accepts_delivery), verified: true };
  }
  if (!trip.hotel_name) return { name: "", acceptsDelivery: false, verified: false };
  const match = await db.from("hotels").select("name, accepts_delivery").eq("city", trip.city).ilike("name", trip.hotel_name).limit(1).maybeSingle();
  if (match.data) return { name: trip.hotel_name, acceptsDelivery: Boolean(match.data.accepts_delivery), verified: true };
  return { name: trip.hotel_name, acceptsDelivery: true, verified: Boolean(trip.hotel_verified_at) };
}

/** The chilled deadline is per purchase and counted from the till, not from now:
 *  a box bought three hours ago has one hour left however long the traveler
 *  spent choosing a counter. */
export async function eligibilityItems(db: SupabaseClient, items: ItemRow[]): Promise<EligibilityItem[]> {
  const ids = items.map((i) => i.purchase_id).filter((id): id is string => Boolean(id));
  const bought = new Map<string, string>();
  if (ids.length) {
    const res = await db.from("purchases").select("id, recorded_at").in("id", ids);
    for (const row of (res.data ?? []) as { id: string; recorded_at: string }[]) bought.set(row.id, row.recorded_at);
  }
  return items.map((i) => {
    const recordedAt = i.purchase_id ? bought.get(i.purchase_id) : null;
    return { handling: i.handling as Handling, bags: i.bags, weightGrams: i.weight_grams, chilledDeadline: i.handling === "Chilled" && recordedAt ? chilledDeadline(new Date(recordedAt)).toISOString() : null };
  });
}

export type Judgement = { planId: string | null; eligibility: Eligibility; quote: ReturnType<typeof quoteFee>; bagCount: number; store: StoreRowLite | null; cutoffAt: string | null; hotel: EligibilityHotel; pricing: PricingRow | null; partnerCount: number; reserveCents: number; flexibleCents: number };

/** One read of everything, then one pure decision. The routes never judge. */
export async function judgeTransfer(db: SupabaseClient, input: { transfer: TransferRowLite; trip: TripLite; items?: ItemRow[]; now?: Date }): Promise<Judgement> {
  const now = input.now ?? new Date();
  const items = input.items ?? (await loadItems(db, input.transfer.id, input.transfer.user_id)).items;
  const [store, partnerCount, pricing, hotel, plan, judged] = await Promise.all([
    loadStore(db, input.transfer.dropoff_store_id),
    countPartners(db, input.trip.city),
    loadPricing(db, input.trip.city, now),
    resolveHotel(db, input.trip),
    loadPlan(db, input.trip.id),
    eligibilityItems(db, items),
  ]);

  const bagCount = items.reduce((sum, i) => sum + i.bags, 0);
  const quote = quoteFee(pricing, bagCount);
  // A confirmed transfer was quoted once and is held to it: the fee on the row is
  // what the traveler was shown and what they will be charged.
  const feeCents = input.transfer.confirmed_at ? input.transfer.fee_cents : quote.feeCents;
  const cutoff = store ? cutoffInstant(now, store.dropoff_cutoff, store.timezone ?? "America/Toronto") : null;
  const reserveCents = plan?.reserveCents ?? 0, flexibleCents = plan?.flexibleCents ?? 0;

  const eligibility = judgeEligibility({
    items: judged, partnerCount, hotel, reserveCents, feeCents, now: now.toISOString(),
    store: store && store.is_partner_point ? { id: store.id, name: store.name, acceptedHandling: store.accepted_handling ?? ["Standard"], maxWeightGrams: store.max_weight_grams, cutoffAt: cutoff ? cutoff.toISOString() : null, timezone: store.timezone ?? "America/Toronto" } : null,
  });

  return { planId: plan?.id ?? null, eligibility, quote: { ...quote, feeCents }, bagCount, store, cutoffAt: cutoff ? cutoff.toISOString() : null, hotel, pricing, partnerCount, reserveCents, flexibleCents };
}

/** Every transfer route answers with the same thing: the transfer as
 *  `GET /api/state` shapes it, plus the wallet, so no screen has to merge two
 *  shapes of the same row. A cancelled or delivered transfer leaves `transfer`
 *  and comes back under `closed` — it did not disappear. */
export async function echoTransfer(db: SupabaseClient, who: { userId: string; email: string; tripId: string; transferId: string }, extra: Record<string, unknown> = {}, status = 200) {
  const state = await loadTrailState(db, who.userId, { tripId: who.tripId, email: who.email });
  const live = state.transfer && state.transfer.id === who.transferId ? state.transfer : null;
  const closed = state.pastTransfers.find((t) => t.id === who.transferId) ?? null;
  return json({ transfer: live, closed, wallet: state.wallet, stateVersion: state.stateVersion, serverTime: state.serverTime, ...extra }, status);
}
