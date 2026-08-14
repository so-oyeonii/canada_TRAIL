/** Everything the screens used to read out of `Record<number, …>`.
 *
 *  The prototype kept four maps keyed by a position in a template array:
 *  `purchases`, `selectedBags`, `replacementIds`, `savedStops`. Adding a recipient
 *  shifted every index, which moved a recorded purchase onto a different gift —
 *  a lost spend record, not a rendering glitch. The replacements below are keyed
 *  by `stops.id`, and one of them does not exist any more:
 *
 *    purchases[i]      → purchaseAt(state, stopId)
 *    savedStops[i]     → stop.saved
 *    selectedBags[i]   → draftItems(state), keyed by ItemKey
 *    replacementIds[i] → gone. A replacement is a new stop whose replacedStopId
 *                        points at the old one. It is an event, not a flag, and
 *                        there is nothing to toggle back. */

import type { DraftItem, ItemKey, Purchase, Stop, StopId, TrailState, TransferEvent } from "./types";

export function stopsById(state: TrailState): Map<StopId, Stop> { return new Map(state.stops.map((s) => [s.id, s])); }
export function stopById(state: TrailState, stopId: StopId): Stop | null { return state.stops.find((s) => s.id === stopId) ?? null; }

/** The live purchase for a stop. A voided purchase is a refund: the row stays for
 *  the audit trail but the screen shows the stop as unbought. */
export function purchaseAt(state: TrailState, stopId: StopId): Purchase | null {
  const purchase = stopById(state, stopId)?.purchase ?? null;
  return purchase && !purchase.voidedAt ? purchase : null;
}

export function boughtStops(state: TrailState): Stop[] { return state.stops.filter((s) => s.status === "bought" && s.purchase && !s.purchase.voidedAt); }
export function savedStops(state: TrailState): Stop[] { return state.stops.filter((s) => s.saved); }
export function isReplacement(stop: Stop): boolean { return stop.replacedStopId !== null; }

/** Stops in route order, with replaced originals dropped: a stop that some other
 *  stop points at with `replacedStopId` is history and must not be walked to. */
export function routeStops(state: TrailState): Stop[] {
  const replaced = new Set(state.stops.map((s) => s.replacedStopId).filter((id): id is StopId => id !== null));
  return state.stops.filter((s) => !replaced.has(s.id));
}

export function itemKeyOf(purchase: Purchase): ItemKey { return purchase.id; }
export function localItemKey(uuid: string): ItemKey { return `local:${uuid}`; }
export function isLocalItemKey(key: ItemKey): boolean { return key.startsWith("local:"); }

/** The bag list for the transfer draft: every live purchase plus anything bought
 *  outside the plan, pre-selected from the transfer that already exists. Server
 *  item ids replace the `local:` keys once a draft is saved. */
export function draftItems(state: TrailState): DraftItem[] {
  const selected = new Set((state.transfer?.items ?? []).map((i) => i.purchaseId).filter((id): id is string => id !== null));
  const fromPurchase = (purchase: Purchase, label: string): DraftItem => ({ key: itemKeyOf(purchase), purchaseId: purchase.id, label, bags: purchase.bags, handling: purchase.handling, weightGrams: null, selected: selected.has(purchase.id) });
  const planned = boughtStops(state).map((s) => fromPurchase(s.purchase as Purchase, s.storeName));
  const unplanned = state.unplannedPurchases.filter((p) => !p.voidedAt).map((p) => fromPurchase(p, p.unplannedLabel ?? "Unplanned bag"));
  const loose = (state.transfer?.items ?? []).filter((i) => i.purchaseId === null).map((i) => ({ key: i.id, purchaseId: null, label: i.label, bags: i.bags, handling: i.handling, weightGrams: i.weightGrams, selected: true }));
  return [...planned, ...unplanned, ...loose];
}

export function selectedBagCount(items: DraftItem[]): number { return items.reduce((sum, i) => sum + (i.selected ? i.bags : 0), 0); }

/** The four labels the tracking screen prints, derived from the ledger.
 *  Returns -1 when custody has not started. There is no setter: `deliveryStep`
 *  was client state that a button incremented, and that is exactly why it could
 *  claim a handoff that never happened. */
const STEP_OF: Partial<Record<TransferEvent["eventType"], number>> = { dropped_off: 0, collected: 1, in_transit: 2, arrived: 2, handed_off: 3 };
export const DELIVERY_STEPS = ["Sealed", "Collected", "On route", "At hotel"] as const;
export function deliveryStep(events: TransferEvent[]): number {
  return events.reduce((step, e) => Math.max(step, STEP_OF[e.eventType] ?? -1), -1);
}

/** Optimistic view while writes are still queued. The server's number is the one
 *  that counts — this only keeps the screen from lagging a tap behind. */
export function spendableWith(state: TrailState, pendingSpendCents: number): number { return state.wallet.spendableCents - pendingSpendCents; }
