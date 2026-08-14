/** Custody, read from the ledger.
 *
 *  `STATUS_AFTER` is the same table as the `apply_transfer_status` trigger in
 *  `0012_custody_is_server_owned.sql`, and a test compares the two so they cannot
 *  drift. The database is the one that writes the status — this copy exists so a
 *  route can answer "what will this event do" without a round trip, never to
 *  write the column itself.
 *
 *  There is no `PATCH /api/transfers/{id}/status`, and adding one would put the
 *  ledger and the status permanently out of step. */

import type { TransferActor, TransferEventType, TransferStatus } from "../state/types";

/** The four a traveler is allowed to claim: what they did, and what went wrong.
 *  Collection, transit and the hotel handoff are somebody else's claim and are
 *  written by the server. RLS enforces this list too. */
export const TRAVELER_EVENTS = ["dropped_off", "delayed", "seal_issue", "cancelled"] as const;
export type TravelerEvent = (typeof TRAVELER_EVENTS)[number];
export const isTravelerEvent = (value: unknown): value is TravelerEvent => typeof value === "string" && (TRAVELER_EVENTS as readonly string[]).includes(value);

/** `declined` is deliberately absent: a partner declining leaves the status
 *  alone (nothing was collected, the delivery is recoverable) while a hotel
 *  declining is a failure. `statusAfter` handles that split. */
export const STATUS_AFTER: Partial<Record<TransferEventType, TransferStatus>> = {
  bags_selected: "awaiting_payment", paid: "paid", dropped_off: "dropped_off", sealed: "dropped_off",
  collected: "in_transit", in_transit: "in_transit", arrived: "in_transit", handed_off: "delivered", cancelled: "cancelled",
};

export const TERMINAL: TransferStatus[] = ["delivered", "cancelled"];

export function statusAfter(eventType: TransferEventType, actor: TransferActor, current: TransferStatus): TransferStatus {
  if (TERMINAL.includes(current)) return current;
  if (eventType === "declined") return actor === "hotel" ? "failed" : current;
  return STATUS_AFTER[eventType] ?? current;
}

export function projectStatus(events: { eventType: TransferEventType; actor: TransferActor }[], initial: TransferStatus = "draft"): TransferStatus {
  return events.reduce((status, e) => statusAfter(e.eventType, e.actor, status), initial);
}

/** Handoff proof. Comparing counts would pass three bags where one of them is
 *  somebody else's, so the sets are compared and the difference is reported both
 *  ways — a missing tag and an extra tag are different incidents. */
export function compareSeals(expected: string[], scanned: string[]) {
  const want = new Set(expected.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const got = new Set(scanned.map((s) => s.trim().toUpperCase()).filter(Boolean));
  const missing = [...want].filter((s) => !got.has(s)).sort();
  const extra = [...got].filter((s) => !want.has(s)).sort();
  return { match: want.size > 0 && missing.length === 0 && extra.length === 0, missing, extra, expected: [...want].sort(), scanned: [...got].sort() };
}

/** What the simulator does next, standing in for a partner terminal and a driver
 *  app that do not exist yet. It only ever runs against rows whose `source` is
 *  `simulated`, so switching a real partner API on does not need this removed. */
export const SIMULATED_CHAIN: { after: TransferEventType | null; status: TransferStatus; eventType: TransferEventType; actor: TransferActor }[] = [
  { after: null, status: "paid", eventType: "collected", actor: "partner" },
  { after: null, status: "dropped_off", eventType: "collected", actor: "partner" },
  { after: "collected", status: "in_transit", eventType: "in_transit", actor: "driver" },
  { after: "in_transit", status: "in_transit", eventType: "arrived", actor: "driver" },
  { after: "arrived", status: "in_transit", eventType: "handed_off", actor: "hotel" },
];

export function nextSimulatedEvent(status: TransferStatus, lastEventType: TransferEventType | null) {
  const step = SIMULATED_CHAIN.find((s) => s.status === status && (s.after === null || s.after === lastEventType));
  return step ? { eventType: step.eventType, actor: step.actor } : null;
}
