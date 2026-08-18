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
export const DELIVERY_STEPS = ["Dropped off", "Collected by Trail", "On the way to hotel", "Delivered"] as const;
export function deliveryStep(events: TransferEvent[]): number {
  return events.reduce((step, e) => Math.max(step, STEP_OF[e.eventType] ?? -1), -1);
}

/** The tracking screen's vertical timeline, projected from the ledger.
 *
 *  Ordering is `seq` (the server's own sequence) and the time shown is
 *  `occurredAt` (what happened, as claimed) — never `created_at`, which is when
 *  the phone got signal again. A drop-off recorded underground at 18:42 and
 *  flushed at 19:10 reads 18:42.
 *
 *  The wireframe draws four successful steps. The schema has four ways this goes
 *  wrong, and constitution 4 says they stay reachable, so a failure gets its own
 *  row rather than a colour on somebody else's:
 *
 *  - `delayed` / `seal_issue` / a partner's `declined` are **interruptions**: the
 *    run continues, so the row is inserted at the point it happened and the
 *    remaining steps stay ahead.
 *  - `cancelled` and a hotel's `declined` are **terminal**: the rows after them are
 *    dropped entirely. Leaving a greyed-out `Delivered` under a refused handoff
 *    says it is still coming, and it is not.
 *
 *  Nothing here decides a status. `transfer.status` is the trigger's answer; this
 *  only decides what is drawn beside it. */
export type TimelineState = "done" | "current" | "future" | "warning" | "failed";
export type TimelineRow = { key: string; label: string; state: TimelineState; at: string | null };
export const TIMELINE_STEPS = ["Dropped off", "Collected by Trail", "On the way to hotel", "Delivered"] as const;
const TIMELINE_STEP_OF: Partial<Record<TransferEvent["eventType"], number>> = { dropped_off: 0, sealed: 0, collected: 1, in_transit: 2, arrived: 2, handed_off: 3 };
const INTERRUPTIONS = ["delayed", "seal_issue", "declined", "cancelled"] as const;
const FAILURE_LABEL: Record<(typeof INTERRUPTIONS)[number], string> = { delayed: "Running late", seal_issue: "Seal problem reported", declined: "The hotel did not take the bags", cancelled: "Delivery cancelled" };

export function timelineRows(events: TransferEvent[], handoffFailureCode: string | null = null): TimelineRow[] {
  const ordered = events.slice().sort((a, b) => a.seq - b.seq);
  const firstAt = new Map<number, string>();
  let reached = -1;
  for (const event of ordered) {
    const step = TIMELINE_STEP_OF[event.eventType];
    if (step === undefined) continue;
    if (!firstAt.has(step)) firstAt.set(step, event.occurredAt);
    reached = Math.max(reached, step);
  }

  const last = ordered.filter((e) => (INTERRUPTIONS as readonly string[]).includes(e.eventType)).pop() ?? null;
  // A partner declining leaves the delivery recoverable; only the hotel's refusal ends it (`statusAfter`).
  const terminal = last ? last.eventType === "cancelled" || (last.eventType === "declined" && last.actor === "hotel") : Boolean(handoffFailureCode);
  const failure = last
    ? { key: last.id, label: FAILURE_LABEL[last.eventType as (typeof INTERRUPTIONS)[number]], state: (terminal ? "failed" : "warning") as TimelineState, at: last.occurredAt }
    : handoffFailureCode
      ? { key: "handoff-failure", label: FAILURE_LABEL.declined, state: "failed" as TimelineState, at: null }
      : null;
  // Where the interruption sits: the furthest step the ledger had reached by then.
  const at = failure && last ? ordered.filter((e) => e.seq <= last.seq).reduce((step, e) => Math.max(step, TIMELINE_STEP_OF[e.eventType] ?? -1), -1) : reached;

  // Cancelled before anything moved: there is no step to hang it off, and drawing
  // "Dropped off" underneath would offer a stage this delivery will never have.
  if (failure && terminal && at < 0) return [failure];

  const rows: TimelineRow[] = [];
  const upTo = failure && terminal ? at : TIMELINE_STEPS.length - 1;
  TIMELINE_STEPS.forEach((label, index) => {
    if (index > upTo) return;
    // Nothing has happened yet: the first step is what the traveller is being asked
    // to do, so it is current rather than four greyed-out rows with no "you are here".
    const state: TimelineState = reached < 0 ? (index === 0 && !terminal ? "current" : "future")
      : index < reached ? "done"
      : index === reached ? (index === TIMELINE_STEPS.length - 1 || terminal ? "done" : "current")
      : "future";
    rows.push({ key: `step-${index}`, label, state, at: firstAt.get(index) ?? null });
    if (failure && index === at) rows.push(failure);
  });
  if (failure && at < 0) rows.unshift(failure);
  return rows;
}

/** Optimistic view while writes are still queued. The server's number is the one
 *  that counts — this only keeps the screen from lagging a tap behind. */
export function spendableWith(state: TrailState, pendingSpendCents: number): number { return state.wallet.spendableCents - pendingSpendCents; }
