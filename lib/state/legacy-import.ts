/** Reading `localStorage["trail-v3-state"]` into rows an account can own.
 *
 *  That blob was written before accounts existed, so it has no owner. Attaching
 *  it to whoever is signed in is not reversible, which is why what does *not*
 *  cross is written down here rather than decided at the call site:
 *
 *    deliveryStep    a number a button incremented. Turning it into custody
 *    transferStatus  events would make the ledger false from its first row.
 *    memoryEnabled   local default was on, the column is opt-in and defaults to
 *                    off. Copying it forges a consent nobody gave.
 *
 *  Money is the opposite: a recorded purchase is the one thing in the blob that
 *  is a fact, and it is restored first. Prices were derived from the budget at
 *  render time; they are frozen at import and never recomputed, so lowering a
 *  budget later cannot rewrite what the traveler was quoted. */

import { legacyAlternativeTemplates, legacyArea, legacyPriceCents, legacyProductTemplates } from "../legacy/v3-templates.ts";
import { splitBudget } from "../../app/onboarding/budget.ts";
import type { Handling, StopStatus } from "./types";

export const LEGACY_STORAGE_KEY = "trail-v3-state";
/** Deliberately dropped. A test asserts none of these reach the built rows. */
export const NEVER_IMPORTED = ["deliveryStep", "transferStatus", "memoryEnabled"] as const;
/** Carried nothing to store: UI flags with no column and no meaning server-side. */
export const NO_DESTINATION = ["shoppingStarted", "paymentRef", "messages"] as const;

export type LegacyPurchase = { status?: string; actualPrice?: number; quantity?: number; bags?: number; handling?: string };
export type LegacyTrip = { country?: string; city?: string; areas?: string[]; startDate?: string; endDate?: string; hotel?: string; hotelAddress?: string; companions?: string; freeTime?: string };
export type LegacyPlan = { recipient?: string; quantity?: number; category?: string; budget?: number; preference?: string; time?: string; localOnly?: boolean; easyPack?: boolean; hotelDelivery?: boolean };
export type LegacyState = { trip?: LegacyTrip; plan?: LegacyPlan; approvedPlan?: LegacyPlan | null; purchases?: Record<string, LegacyPurchase>; replacementIds?: Record<string, boolean>; savedStops?: Record<string, boolean>; [key: string]: unknown };

export type ImportPurchase = { actualPriceCents: number; quantity: number; bags: number; handling: Handling };
export type ImportStop = { sequence: number; plannedDay: number; status: StopStatus; productName: string; storeName: string; storeAddress: string; area: string; snapshotPriceCents: number; handling: Handling; rationale: string; saved: boolean; fromAlternative: boolean; purchase: ImportPurchase | null };
export type ImportPlanRow = { status: "draft" | "approved"; totalCents: number; plannedCents: number; deliveryReserveCents: number; flexibleCents: number; category: string; preference: string; localOnly: boolean; easyPack: boolean; hotelDelivery: boolean; approvedAt: string | null };
export type ImportTripRow = { status: "planning"; country: string; city: string; areas: string[]; startDate: string | null; endDate: string | null; hotelName: string; hotelAddress: string; companions: string; freeTime: string; currency: string };
export type ImportPlanResult = { trip: ImportTripRow; plan: ImportPlanRow; stops: ImportStop[]; dropped: string[] };

const HANDLING = new Set<Handling>(["Standard", "Heavy", "Fragile", "Chilled"]);
const STOP_STATUS = new Set<StopStatus>(["planned", "bought", "unavailable", "skipped"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const count = (value: unknown, fallback: number, max: number) => (typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), max) : fallback);
const date = (value: unknown) => (typeof value === "string" && DATE.test(value) ? value : null);
const handlingOf = (value: unknown, fallback: Handling): Handling => (typeof value === "string" && HANDLING.has(value as Handling) ? (value as Handling) : fallback);

/** `null` means 422: the device has something under that key but it is not a
 *  trip we can read. It is renamed rather than deleted so it can be inspected. */
export function parseLegacyBlob(raw: string): LegacyState | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const state = parsed as LegacyState;
  const trip = state.trip;
  if (!trip || typeof trip !== "object" || Array.isArray(trip)) return null;
  if (!text(trip.city)) return null;
  return state;
}

/** Which of the forbidden keys this particular device actually held. Reported to
 *  the traveler rather than passed over in silence. */
export function droppedFields(state: LegacyState): string[] {
  return [...NEVER_IMPORTED, ...NO_DESTINATION].filter((key) => state[key] !== undefined && state[key] !== null);
}

export function planImport(state: LegacyState, now = new Date().toISOString()): ImportPlanResult {
  const legacyTrip = state.trip ?? {};
  const approved = state.approvedPlan && typeof state.approvedPlan === "object" ? state.approvedPlan : null;
  const brief = approved ?? (state.plan && typeof state.plan === "object" ? state.plan : {});
  const areas = Array.isArray(legacyTrip.areas) ? legacyTrip.areas.map((a) => text(a)).filter(Boolean).slice(0, 12) : [];
  const city = text(legacyTrip.city, "Toronto");
  const budget = typeof brief.budget === "number" && Number.isFinite(brief.budget) ? Math.max(0, Math.round(brief.budget)) : 0;
  const buckets = splitBudget(budget);

  const trip: ImportTripRow = { status: "planning", country: text(legacyTrip.country), city, areas, startDate: date(legacyTrip.startDate), endDate: date(legacyTrip.endDate), hotelName: text(legacyTrip.hotel), hotelAddress: text(legacyTrip.hotelAddress), companions: text(legacyTrip.companions), freeTime: text(legacyTrip.freeTime), currency: "CAD" };
  const plan: ImportPlanRow = { status: approved ? "approved" : "draft", totalCents: buckets.total * 100, plannedCents: buckets.planned * 100, deliveryReserveCents: buckets.reserve * 100, flexibleCents: buckets.flexible * 100, category: text(brief.category, "Open to ideas"), preference: text(brief.preference, "Thoughtful and useful"), localOnly: flag(brief.localOnly, true), easyPack: flag(brief.easyPack, true), hotelDelivery: flag(brief.hotelDelivery, true), approvedAt: approved ? now : null };

  const purchases = state.purchases && typeof state.purchases === "object" ? state.purchases : {};
  const replacements = state.replacementIds && typeof state.replacementIds === "object" ? state.replacementIds : {};
  const saved = state.savedStops && typeof state.savedStops === "object" ? state.savedStops : {};

  const stops = legacyProductTemplates.map((_, index) => {
    // A replaced stop imports as the alternative it became. The original is not
    // recreated: the device never recorded that it existed.
    const fromAlternative = Boolean(replacements[String(index)]);
    const template = (fromAlternative ? legacyAlternativeTemplates[index] : legacyProductTemplates[index]) ?? legacyProductTemplates[index];
    const legacyPurchase = purchases[String(index)];
    const status = (typeof legacyPurchase?.status === "string" && STOP_STATUS.has(legacyPurchase.status as StopStatus) ? legacyPurchase.status : "planned") as StopStatus;
    const bought = status === "bought";
    const handling = handlingOf(legacyPurchase?.handling, template.handling);
    return {
      sequence: index, plannedDay: 1, status, productName: template.name, storeName: template.store, storeAddress: template.address,
      area: legacyArea(areas, city, index), snapshotPriceCents: legacyPriceCents(budget, index), handling: template.handling,
      rationale: template.reason, saved: Boolean(saved[String(index)]), fromAlternative,
      purchase: bought ? { actualPriceCents: Math.max(0, Math.round((typeof legacyPurchase?.actualPrice === "number" && Number.isFinite(legacyPurchase.actualPrice) ? legacyPurchase.actualPrice : 0) * 100)), quantity: count(legacyPurchase?.quantity, 1, 999), bags: count(legacyPurchase?.bags, 1, 99), handling } : null,
    } satisfies ImportStop;
  });

  return { trip, plan, stops, dropped: droppedFields(state) };
}
