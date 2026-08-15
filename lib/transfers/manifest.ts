/** The bag manifest, as a whole-record replacement.
 *
 *  `PUT /api/transfers/{id}/items` sends the entire list every time, which is
 *  what makes an outbox replay safe — but only if replaying lands on the rows
 *  that already exist. Delete-all-then-insert would do that too and would also
 *  leave the manifest empty if the insert failed halfway, so the write is a diff:
 *  keep, update, remove.
 *
 *  Two things the client does not get to decide:
 *    1. `handling` and `bags` for a purchase-linked bag come from the purchase
 *       row. A client that could relabel a Chilled box as Standard would walk
 *       straight past `handling_unsupported` and the chilled deadline.
 *    2. Nothing here is keyed by an array position. A loose bag matches by id,
 *       then by label, then by the order the leftovers arrived in. */

import type { Handling } from "../state/types";
import { HANDLING } from "../purchases/record.ts";
import { UUID } from "../api/http.ts";

export const MAX_ITEMS = 40;
export const MAX_BAGS_PER_ITEM = 20;
export const MAX_WEIGHT_GRAMS = 60_000;

export type ManifestInput = { id: string | null; purchaseId: string | null; label: string; bags: number; handling: Handling; weightGrams: number | null };
export type ManifestParse = { ok: true; items: ManifestInput[] } | { ok: false; field: string };

const label = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) : "");

/** A bad field is a named 400. Nothing is coerced: a weight of `"heavy"` is a
 *  bug in the caller, and silently reading it as null hides it. */
export function parseManifest(raw: unknown): ManifestParse {
  if (!Array.isArray(raw)) return { ok: false, field: "items" };
  if (raw.length > MAX_ITEMS) return { ok: false, field: "items" };
  const items: ManifestInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false, field: "items" };
    const e = entry as Record<string, unknown>;

    let id: string | null = null;
    if (e.id !== undefined && e.id !== null) { if (typeof e.id !== "string" || !UUID.test(e.id)) return { ok: false, field: "items[].id" }; id = e.id; }

    // `key` is the picker's ItemKey: a purchase id, or `local:<uuid>` for a bag
    // the server has never seen. Only the first half is a purchase.
    const rawPurchase = e.purchaseId ?? (typeof e.key === "string" && !e.key.startsWith("local:") ? e.key : null);
    let purchaseId: string | null = null;
    if (rawPurchase !== undefined && rawPurchase !== null) { if (typeof rawPurchase !== "string" || !UUID.test(rawPurchase)) return { ok: false, field: "items[].purchaseId" }; purchaseId = rawPurchase; }

    const text = label(e.label ?? e.unplannedLabel);
    if (!purchaseId && !text) return { ok: false, field: "items[].label" };   // transfer_items_labelled

    const bags = e.bags === undefined ? 1 : e.bags;
    if (typeof bags !== "number" || !Number.isInteger(bags) || bags < 1 || bags > MAX_BAGS_PER_ITEM) return { ok: false, field: "items[].bags" };

    const handling = e.handling === undefined ? "Standard" : e.handling;
    if (typeof handling !== "string" || !(HANDLING as readonly string[]).includes(handling)) return { ok: false, field: "items[].handling" };

    let weightGrams: number | null = null;
    if (e.weightGrams !== undefined && e.weightGrams !== null) { const w = e.weightGrams; if (typeof w !== "number" || !Number.isInteger(w) || w < 0 || w > MAX_WEIGHT_GRAMS) return { ok: false, field: "items[].weightGrams" }; weightGrams = w; }

    items.push({ id, purchaseId, label: text, bags, handling: handling as Handling, weightGrams });
  }
  // The same purchase twice is one bag entered twice, and the partial unique
  // index (transfer_id, purchase_id) would refuse the insert anyway.
  const seen = new Set<string>();
  for (const item of items) { if (!item.purchaseId) continue; if (seen.has(item.purchaseId)) return { ok: false, field: "items[].purchaseId" }; seen.add(item.purchaseId); }
  return { ok: true, items };
}

export const bagCountOf = (items: { bags: number }[]) => items.reduce((sum, i) => sum + i.bags, 0);

/** Null when no bag declares a weight — 0 would claim the traveler weighed them. */
export function weightOf(items: { weightGrams: number | null }[]): number | null {
  const declared = items.filter((i) => i.weightGrams !== null);
  return declared.length ? declared.reduce((sum, i) => sum + (i.weightGrams ?? 0), 0) : null;
}

export type ExistingItem = { id: string; purchase_id: string | null; label: string };
export type ManifestPlan = { update: { id: string; item: ManifestInput }[]; insert: ManifestInput[]; remove: string[] };

const key = (value: string) => value.trim().toLowerCase();

/** Matching order: row id, then purchase id, then label, then the order the
 *  leftovers arrived in. The last rule is what keeps two loose bags called
 *  "Bag" from turning into four on a replay. */
export function planManifest(existing: ExistingItem[], incoming: ManifestInput[]): ManifestPlan {
  const free = existing.slice();
  const take = (predicate: (row: ExistingItem) => boolean) => { const at = free.findIndex(predicate); return at === -1 ? null : free.splice(at, 1)[0]; };
  const matched = new Map<ManifestInput, string>();
  const rest: ManifestInput[] = [];

  for (const item of incoming) { const row = item.id ? take((r) => r.id === item.id) : null; if (row) matched.set(item, row.id); else rest.push(item); }
  const stillLoose: ManifestInput[] = [];
  for (const item of rest) { const row = item.purchaseId ? take((r) => r.purchase_id === item.purchaseId) : null; if (row) matched.set(item, row.id); else stillLoose.push(item); }
  const unlabelled: ManifestInput[] = [];
  for (const item of stillLoose) { const row = item.purchaseId ? null : take((r) => r.purchase_id === null && key(r.label) === key(item.label)); if (row) matched.set(item, row.id); else unlabelled.push(item); }
  const insert: ManifestInput[] = [];
  for (const item of unlabelled) { const row = item.purchaseId ? null : take((r) => r.purchase_id === null); if (row) matched.set(item, row.id); else insert.push(item); }

  return { update: incoming.filter((i) => matched.has(i)).map((i) => ({ id: matched.get(i) as string, item: i })), insert, remove: free.map((r) => r.id) };
}
