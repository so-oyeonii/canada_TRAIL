/** Whether these bags can be delivered, decided on the server from rows.
 *
 *  Constitution 4 keeps "delivery is not possible" alive as a real branch, and a
 *  branch that is only copy is not alive. Every code below is read from data
 *  0011 added — accepted handling, weight ceiling, cutoff, hotel policy, the
 *  reserve in the wallet — so the screen renders a decision instead of making
 *  one. The bag selection survives a refusal: the transfer stays `draft`.
 *
 *  `remedies` are codes, not sentences. Copy belongs to product-lead. */

import type { Handling, IneligibleCode } from "../state/types";

export type { IneligibleCode };
export type Remedy = "pick_other_partner" | "try_tomorrow" | "drop_chilled_items" | "split_bags" | "confirm_hotel" | "use_other_address" | "approve_flexible" | "choose_partner";

export type EligibilityItem = { handling: Handling; bags: number; weightGrams: number | null; chilledDeadline?: string | null };
export type EligibilityStore = { id: string; name: string; acceptedHandling: Handling[]; maxWeightGrams: number | null; cutoffAt: string | null; timezone: string };
export type EligibilityHotel = { name: string; acceptsDelivery: boolean; verified: boolean };
export type EligibilityInput = { items: EligibilityItem[]; store: EligibilityStore | null; partnerCount: number; hotel: EligibilityHotel; reserveCents: number; feeCents: number; now: string };
export type Eligibility = { eligible: boolean; code: IneligibleCode | null; detail: string; remedies: Remedy[] };

const no = (code: IneligibleCode, detail: string, remedies: Remedy[]): Eligibility => ({ eligible: false, code, detail, remedies });

export function judgeEligibility(input: EligibilityInput): Eligibility {
  const now = Date.parse(input.now);

  if (input.partnerCount === 0) return no("no_partner_nearby", "No Trail drop-off point in this city yet.", ["try_tomorrow"]);
  if (!input.items.length) return { eligible: false, code: null, detail: "No bags selected.", remedies: [] };
  if (!input.store) return { eligible: false, code: null, detail: "No drop-off point chosen yet.", remedies: ["choose_partner"] };

  if (!input.hotel.name) return no("hotel_refuses", "No hotel on the trip to deliver to.", ["use_other_address"]);
  if (!input.hotel.acceptsDelivery) return no("hotel_refuses", `${input.hotel.name} does not accept third-party deliveries.`, ["use_other_address", "confirm_hotel"]);

  const accepted = new Set(input.store.acceptedHandling);
  const unsupported = input.items.find((i) => !accepted.has(i.handling));
  if (unsupported) return no("handling_unsupported", `${input.store.name} does not take ${unsupported.handling.toLowerCase()} items.`, ["pick_other_partner", "split_bags"]);

  const totalWeight = input.items.reduce((sum, i) => sum + (i.weightGrams ?? 0), 0);
  if (input.store.maxWeightGrams !== null && totalWeight > input.store.maxWeightGrams) return no("handling_unsupported", `Over the ${Math.round(input.store.maxWeightGrams / 1000)} kg limit at ${input.store.name}.`, ["split_bags", "pick_other_partner"]);

  const cutoff = input.store.cutoffAt ? Date.parse(input.store.cutoffAt) : NaN;
  if (Number.isFinite(cutoff) && now > cutoff) return no("cutoff_passed", `Drop-off at ${input.store.name} closed for today.`, ["pick_other_partner", "try_tomorrow"]);

  // Chilled is the one deadline the delivery cannot hold overnight, and it is
  // per item: one box of chocolate can make the whole run impossible.
  const expired = input.items.find((i) => i.handling === "Chilled" && i.chilledDeadline && Date.parse(i.chilledDeadline) < now);
  if (expired) return no("chilled_window_closed", "A chilled item is past its safe window.", ["drop_chilled_items"]);

  // Constitution 5: the reserve pays for this. Taking the difference out of the
  // flexible bucket needs the traveler's approval, which is a screen, not a
  // silent top-up here.
  if (input.feeCents > input.reserveCents) return no("reserve_short", "The delivery costs more than the reserve set aside for it.", ["approve_flexible"]);

  return { eligible: true, code: null, detail: "", remedies: [] };
}
