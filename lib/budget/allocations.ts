/** Who the shopping bucket is divided between, with no database in sight.
 *
 *  Three refusals live here and none of them round anything:
 *
 *  1. **No ten-unit snap, ever.** The prototype's slider snapped to 10, so
 *     58/68/39/45 became 60/70/40/50 and the four of them added up to eleven more
 *     than the traveller had. An allocation is stored exactly as it was entered.
 *  2. **Equal value is all or nothing.** Two gifts tagged into the same group must
 *     land on the same number. Levelling the odd one up to the largest would put a
 *     figure in the plan that nobody said, so the write is refused instead.
 *  3. **Over the shopping bucket is a proposal, not a write.** Exceeding
 *     `planned_cents` never writes quietly and never trims a recipient — it comes
 *     back as the body for `POST /api/budget-changes`, which the traveller taps.
 *
 *  `basis` is resolved here too: `per_person` on a group of 12 is stored as the
 *  group total, so every reader of `plan_allocations.amount_cents` sees one kind
 *  of number. The unit figure travels back in the response, not in a column. */

import type { BudgetBucket } from "../state/types";

export type AllocationBasis = "per_person" | "group_total";
export const ALLOCATION_BASIS: readonly AllocationBasis[] = ["per_person", "group_total"];
export const BUCKETS: readonly BudgetBucket[] = ["planned", "delivery_reserve", "flexible"];
/** 100,000 whole units — the same ceiling the model is given for a trip total. */
export const MAX_ALLOCATION_CENTS = 10_000_000;
export const MAX_ALLOCATIONS = 24;

export type AllocationEntry = { recipientId: string; unitAmountCents: number; basis: AllocationBasis; bucket: BudgetBucket };
export type ResolvedAllocation = AllocationEntry & { amountCents: number };
/** What the database knows about the people being divided between. */
export type AllocationPerson = { id: string; name: string; groupSize: number; equalValueGroup: string | null };

export type ParsedAllocations = { entries: AllocationEntry[]; clientOpId: string | null; reason: string };
export type ParseFailure = { ok: false; field: string; reason: "missing" | "invalid" | "duplicate" | "too_many" };
export type ParseResult = { ok: true; value: ParsedAllocations } | ParseFailure;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);

/** Body: `{ allocations: [{ recipientId, amountCents, basis?, bucket? }], reason?, clientOpId? }`.
 *  A whole-list replacement, so an outbox replay of the same body is the same result. */
export function parseAllocationsBody(body: Record<string, unknown>): ParseResult {
  const raw = body.allocations;
  if (!Array.isArray(raw)) return { ok: false, field: "allocations", reason: "missing" };
  if (raw.length > MAX_ALLOCATIONS) return { ok: false, field: "allocations", reason: "too_many" };
  const entries: AllocationEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = (raw[i] ?? {}) as Record<string, unknown>;
    const recipientId = typeof row.recipientId === "string" ? row.recipientId : null;
    if (!recipientId) return { ok: false, field: `allocations[${i}].recipientId`, reason: "missing" };
    if (seen.has(recipientId)) return { ok: false, field: `allocations[${i}].recipientId`, reason: "duplicate" };
    seen.add(recipientId);
    const amount = row.amountCents;
    if (!isInt(amount) || amount < 0 || amount > MAX_ALLOCATION_CENTS) return { ok: false, field: `allocations[${i}].amountCents`, reason: "invalid" };
    const basis = row.basis === undefined || row.basis === null ? "group_total" : row.basis;
    if (typeof basis !== "string" || !(ALLOCATION_BASIS as readonly string[]).includes(basis)) return { ok: false, field: `allocations[${i}].basis`, reason: "invalid" };
    const bucket = row.bucket === undefined || row.bucket === null ? "planned" : row.bucket;
    if (typeof bucket !== "string" || !(BUCKETS as readonly string[]).includes(bucket)) return { ok: false, field: `allocations[${i}].bucket`, reason: "invalid" };
    entries.push({ recipientId, unitAmountCents: amount, basis: basis as AllocationBasis, bucket: bucket as BudgetBucket });
  }
  const clientOpId = body.clientOpId === undefined || body.clientOpId === null ? null : typeof body.clientOpId === "string" && body.clientOpId.length <= 120 ? body.clientOpId : null;
  if (body.clientOpId !== undefined && body.clientOpId !== null && clientOpId === null) return { ok: false, field: "clientOpId", reason: "invalid" };
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "";
  return { ok: true, value: { entries, clientOpId, reason } };
}

/** `per_person × group_size`, computed once so nothing downstream has to guess. */
export function resolveAllocations(entries: AllocationEntry[], people: Map<string, AllocationPerson>): ResolvedAllocation[] {
  return entries.map((e) => ({ ...e, amountCents: e.basis === "per_person" ? e.unitAmountCents * Math.max(1, people.get(e.recipientId)?.groupSize ?? 1) : e.unitAmountCents }));
}

export type EqualValueConflict = { group: string; members: { recipientId: string; name: string; amountCents: number | null }[] };

/** Everyone carrying the same tag must end on the same total. A tagged recipient
 *  left out of the replacement conflicts too: absent is not "agrees". */
export function equalValueConflicts(resolved: ResolvedAllocation[], people: AllocationPerson[]): EqualValueConflict[] {
  const byId = new Map(resolved.map((r) => [r.recipientId, r]));
  const groups = new Map<string, EqualValueConflict["members"]>();
  for (const person of people) {
    const tag = person.equalValueGroup;
    if (!tag) continue;
    const hit = byId.get(person.id) ?? null;
    groups.set(tag, [...(groups.get(tag) ?? []), { recipientId: person.id, name: person.name, amountCents: hit ? hit.amountCents : null }]);
  }
  const conflicts: EqualValueConflict[] = [];
  for (const [group, members] of groups) {
    if (members.length < 2) continue;
    if (new Set(members.map((m) => m.amountCents)).size > 1) conflicts.push({ group, members });
  }
  return conflicts;
}

export const allocatedCents = (resolved: { amountCents: number; bucket: BudgetBucket }[], bucket: BudgetBucket = "planned") => resolved.filter((r) => r.bucket === bucket).reduce((sum, r) => sum + r.amountCents, 0);

export type AllocationVerdict =
  | { verdict: "apply"; resolved: ResolvedAllocation[]; allocatedCents: number }
  | { verdict: "unknown_recipient"; recipientIds: string[] }
  | { verdict: "equal_value_conflict"; conflicts: EqualValueConflict[] }
  | { verdict: "exceeds_planned"; resolved: ResolvedAllocation[]; allocatedCents: number; plannedCents: number; overCents: number };

/** Order matters: a contradiction is answered before a shortfall, because a
 *  conflicting pair has no total worth proposing a budget change for. */
export function decideAllocations(input: { entries: AllocationEntry[]; people: AllocationPerson[]; plannedCents: number }): AllocationVerdict {
  const map = new Map(input.people.map((p) => [p.id, p]));
  const unknown = input.entries.filter((e) => !map.has(e.recipientId)).map((e) => e.recipientId);
  if (unknown.length) return { verdict: "unknown_recipient", recipientIds: unknown };
  const resolved = resolveAllocations(input.entries, map);
  const conflicts = equalValueConflicts(resolved, input.people);
  if (conflicts.length) return { verdict: "equal_value_conflict", conflicts };
  const total = allocatedCents(resolved);
  if (total > input.plannedCents) return { verdict: "exceeds_planned", resolved, allocatedCents: total, plannedCents: input.plannedCents, overCents: total - input.plannedCents };
  return { verdict: "apply", resolved, allocatedCents: total };
}
