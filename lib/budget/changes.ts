/** The proposal → approval gate for every number in the wallet.
 *
 *  Constitution 1 in data form: Trail may propose a budget move, and only a tap
 *  from the traveller applies it. `budget_changes` is that tap's record, and the
 *  approval is the only thing allowed to write `plan_events` with
 *  `actor='approval', stage='approved'` — the `ai_cannot_approve` check in 0001
 *  rejects any other actor at that stage.
 *
 *  `after_state` is re-validated on approval and not only on proposal. RLS lets a
 *  traveller insert their own `budget_changes` row directly, so a proposal that
 *  reached the table without passing through `POST /api/budget-changes` must not
 *  become a plan write just because it says `approved` on the way in.
 *
 *  Moving money out of `delivery_reserve` is the third path that breaks the
 *  wallet constraint, so it is refused while a transfer is still open: the
 *  reserve is what pays for bags that are already on their way. */

import { allocatedCents, MAX_ALLOCATION_CENTS } from "./allocations.ts";
import type { BudgetBucket } from "../state/types";

export type BudgetChangeKind = "allocation_overrun" | "bucket_move" | "total_change" | "reserve_release";
export const BUDGET_CHANGE_KINDS: readonly BudgetChangeKind[] = ["allocation_overrun", "bucket_move", "total_change", "reserve_release"];
export type BudgetChangeStatus = "proposed" | "approved" | "rejected";
/** `plan_actor` in the database. `approval` is reserved for the decision itself. */
export type PlanActor = "user_edit" | "ai_patch" | "regex_suggestion" | "system_clamp" | "approval" | "revert";
export const PROPOSERS: readonly PlanActor[] = ["user_edit", "ai_patch", "regex_suggestion", "system_clamp"];

export type PlanBuckets = { totalCents: number; plannedCents: number; deliveryReserveCents: number; flexibleCents: number };
export type AllocationSnapshot = { recipientId: string; amountCents: number; bucket: BudgetBucket };
/** Both `before_state` and `after_state` are this shape, so a diff is a field walk. */
export type BudgetState = { kind: BudgetChangeKind; plan: PlanBuckets; allocations: AllocationSnapshot[] | null };

export type ChangeFailure = { ok: false; field: string; reason: "missing" | "invalid" | "buckets_do_not_sum" | "total_changed" | "allocations_exceed_planned" | "no_change" | "reserve_locked" };
export type ParsedChange = { kind: BudgetChangeKind; reason: string; proposedBy: PlanActor; clientOpId: string | null; before: BudgetState; after: BudgetState };
export type ChangeResult = { ok: true; value: ParsedChange } | ChangeFailure;

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
const inRange = (v: number) => v >= 0 && v <= MAX_ALLOCATION_CENTS;

export const sumBuckets = (p: PlanBuckets) => p.plannedCents + p.deliveryReserveCents + p.flexibleCents;
export const sameBuckets = (a: PlanBuckets, b: PlanBuckets) => a.totalCents === b.totalCents && a.plannedCents === b.plannedCents && a.deliveryReserveCents === b.deliveryReserveCents && a.flexibleCents === b.flexibleCents;

function readAllocations(raw: unknown, field: string): { ok: true; value: AllocationSnapshot[] | null } | ChangeFailure {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!Array.isArray(raw)) return { ok: false, field, reason: "invalid" };
  const out: AllocationSnapshot[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const row = (raw[i] ?? {}) as Record<string, unknown>;
    const recipientId = typeof row.recipientId === "string" ? row.recipientId : null;
    if (!recipientId || seen.has(recipientId)) return { ok: false, field: `${field}[${i}].recipientId`, reason: "invalid" };
    seen.add(recipientId);
    if (!isInt(row.amountCents) || !inRange(row.amountCents)) return { ok: false, field: `${field}[${i}].amountCents`, reason: "invalid" };
    const bucket = row.bucket === undefined || row.bucket === null ? "planned" : row.bucket;
    if (bucket !== "planned" && bucket !== "delivery_reserve" && bucket !== "flexible") return { ok: false, field: `${field}[${i}].bucket`, reason: "invalid" };
    out.push({ recipientId, amountCents: row.amountCents, bucket });
  }
  return { ok: true, value: out };
}

/** A partial patch: any bucket the body leaves out keeps the value the plan has
 *  today, and `totalCents` defaults to the sum rather than to the old total —
 *  omitting it must not silently turn a top-up into a broken invariant. */
export function readBuckets(raw: unknown, before: PlanBuckets, field = "plan"): { ok: true; value: PlanBuckets } | ChangeFailure {
  const row = (raw ?? {}) as Record<string, unknown>;
  const pick = (key: keyof PlanBuckets, fallback: number) => (row[key] === undefined || row[key] === null ? fallback : row[key]);
  const planned = pick("plannedCents", before.plannedCents), reserve = pick("deliveryReserveCents", before.deliveryReserveCents), flexible = pick("flexibleCents", before.flexibleCents);
  for (const [key, value] of [["plannedCents", planned], ["deliveryReserveCents", reserve], ["flexibleCents", flexible]] as const) if (!isInt(value) || !inRange(value)) return { ok: false, field: `${field}.${key}`, reason: "invalid" };
  const sum = (planned as number) + (reserve as number) + (flexible as number);
  const total = row.totalCents === undefined || row.totalCents === null ? sum : row.totalCents;
  if (!isInt(total) || !inRange(total)) return { ok: false, field: `${field}.totalCents`, reason: "invalid" };
  if (total !== sum) return { ok: false, field: `${field}.totalCents`, reason: "buckets_do_not_sum" };
  return { ok: true, value: { totalCents: total, plannedCents: planned as number, deliveryReserveCents: reserve as number, flexibleCents: flexible as number } };
}

/** Body: `{ kind, reason, plan?, allocations?, proposedBy?, clientOpId? }`.
 *  `before` is read from the live plan by the route, never from the client. */
export function parseBudgetChange(body: Record<string, unknown>, before: BudgetState): ChangeResult {
  const kind = typeof body.kind === "string" && (BUDGET_CHANGE_KINDS as readonly string[]).includes(body.kind) ? (body.kind as BudgetChangeKind) : null;
  if (!kind) return { ok: false, field: "kind", reason: "invalid" };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
  if (!reason) return { ok: false, field: "reason", reason: "missing" };
  const proposedBy = body.proposedBy === undefined || body.proposedBy === null ? "user_edit" : body.proposedBy;
  if (typeof proposedBy !== "string" || !(PROPOSERS as readonly string[]).includes(proposedBy)) return { ok: false, field: "proposedBy", reason: "invalid" };
  const clientOpId = body.clientOpId === undefined || body.clientOpId === null ? null : typeof body.clientOpId === "string" && body.clientOpId.length <= 120 ? body.clientOpId : null;
  if (body.clientOpId !== undefined && body.clientOpId !== null && clientOpId === null) return { ok: false, field: "clientOpId", reason: "invalid" };

  const buckets = readBuckets(body.plan, before.plan);
  if (!buckets.ok) return buckets;
  const allocations = readAllocations(body.allocations, "allocations");
  if (!allocations.ok) return allocations;

  const after: BudgetState = { kind, plan: buckets.value, allocations: allocations.value };
  const invalid = validateAfterState(before, after);
  if (invalid) return invalid;
  return { ok: true, value: { kind, reason, proposedBy: proposedBy as PlanActor, clientOpId, before, after } };
}

/** Run on proposal *and* again on approval. The second run is the one that
 *  matters: the row may have been written straight to the table. */
export function validateAfterState(before: BudgetState, after: BudgetState): ChangeFailure | null {
  if (after.plan.totalCents !== sumBuckets(after.plan)) return { ok: false, field: "plan.totalCents", reason: "buckets_do_not_sum" };
  if (after.kind === "bucket_move" && after.plan.totalCents !== before.plan.totalCents) return { ok: false, field: "plan.totalCents", reason: "total_changed" };
  if (after.allocations) {
    const planned = allocatedCents(after.allocations);
    if (planned > after.plan.plannedCents) return { ok: false, field: "allocations", reason: "allocations_exceed_planned" };
  }
  if (sameBuckets(before.plan, after.plan) && !after.allocations) return { ok: false, field: "plan", reason: "no_change" };
  return null;
}

/** The reserve pays for bags that are already moving. Draining it mid-transfer is
 *  how the wallet constraint gets broken from the side nobody watches. */
export function reserveLocked(before: PlanBuckets, after: PlanBuckets, openTransferFeeCents: number | null): boolean {
  if (openTransferFeeCents === null) return false;
  return after.deliveryReserveCents < before.deliveryReserveCents && after.deliveryReserveCents < openTransferFeeCents;
}

export type PlanRowPatch = { total_cents: number; planned_cents: number; delivery_reserve_cents: number; flexible_cents: number };
export const planPatch = (p: PlanBuckets): PlanRowPatch => ({ total_cents: p.totalCents, planned_cents: p.plannedCents, delivery_reserve_cents: p.deliveryReserveCents, flexible_cents: p.flexibleCents });

/** Reads a stored jsonb snapshot back into a shape the route can trust, or null
 *  if the row was hand-written into something this code does not recognise. */
export function readState(raw: unknown): BudgetState | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const kind = typeof row.kind === "string" && (BUDGET_CHANGE_KINDS as readonly string[]).includes(row.kind) ? (row.kind as BudgetChangeKind) : null;
  const plan = (row.plan ?? null) as Record<string, unknown> | null;
  if (!kind || !plan) return null;
  for (const key of ["totalCents", "plannedCents", "deliveryReserveCents", "flexibleCents"]) if (!isInt(plan[key]) || !inRange(plan[key] as number)) return null;
  const allocations = readAllocations(row.allocations, "allocations");
  if (!allocations.ok) return null;
  return { kind, plan: { totalCents: plan.totalCents as number, plannedCents: plan.plannedCents as number, deliveryReserveCents: plan.deliveryReserveCents as number, flexibleCents: plan.flexibleCents as number }, allocations: allocations.value };
}
