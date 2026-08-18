/** Reading a recipient off the wire, and reading the AI's recipient ops.
 *
 *  Two things are deliberate:
 *
 *  1. **`archived_at`, never DELETE.** A recipient is attached to stops and to
 *     purchases that already happened; deleting the row would take the reason for
 *     a spend with it. Archiving hides them from planning and keeps the history.
 *  2. **The model's amounts are whole units, the database's are cents.** The
 *     chat schema hands the model `allocation_amount` in dollars because that is
 *     what the traveller says out loud. The conversion happens here, once, and
 *     `×100` is the only arithmetic ever applied to it — no rounding to ten.
 *
 *  Refs (`r1`, `r2`…) are positional labels minted for the model so it never sees
 *  a uuid. They are resolved back to ids by the route, either from a map the
 *  client sends or from the trip's own creation order — a ref that resolves to
 *  nobody is rejected, never promoted into a new person. */

import { toMinor } from "../money/format.ts";
import type { RecipientOp } from "../../app/trail-brief.ts";

export const MAX_GROUP_SIZE = 30;
export const MAX_RECIPIENT_OPS = 8;

export type RecipientPatch = { name?: string; relationship?: string; group_size?: number; priority?: number; is_self?: boolean; is_optional?: boolean; preference_note?: string; equal_value_group?: string | null };
export type RecipientFailure = { ok: false; field: string; reason: "missing" | "invalid" | "empty_patch" };
export type RecipientParse<T> = { ok: true; value: T } | RecipientFailure;

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max) : null);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);

/** POST body: `{ tripId?, name, relationship?, groupSize?, priority?, isSelf?, isOptional?, preferenceNote?, equalValueGroup? }`. */
export function parseRecipientCreate(body: Record<string, unknown>): RecipientParse<Required<Omit<RecipientPatch, "equal_value_group">> & { equal_value_group: string | null }> {
  const name = text(body.name, 40);
  if (!name) return { ok: false, field: "name", reason: "missing" };
  const patch = parseRecipientPatch({ ...body, name }, true);
  if (!patch.ok) return patch;
  const p = patch.value;
  return { ok: true, value: { name, relationship: p.relationship ?? "", group_size: p.group_size ?? 1, priority: p.priority ?? 3, is_self: p.is_self ?? false, is_optional: p.is_optional ?? false, preference_note: p.preference_note ?? "", equal_value_group: p.equal_value_group ?? null } };
}

/** PATCH body: any subset of the same fields. `equalValueGroup: null` clears the
 *  tag — an omitted key and an explicit null are different instructions. */
export function parseRecipientPatch(body: Record<string, unknown>, allowEmpty = false): RecipientParse<RecipientPatch> {
  const patch: RecipientPatch = {};
  if ("name" in body) { const name = text(body.name, 40); if (!name) return { ok: false, field: "name", reason: "invalid" }; patch.name = name; }
  if ("relationship" in body) { const value = body.relationship === null ? "" : text(body.relationship, 30); if (value === null) return { ok: false, field: "relationship", reason: "invalid" }; patch.relationship = value; }
  if ("preferenceNote" in body) { const value = body.preferenceNote === null ? "" : text(body.preferenceNote, 200); if (value === null) return { ok: false, field: "preferenceNote", reason: "invalid" }; patch.preference_note = value; }
  if ("equalValueGroup" in body) { const value = body.equalValueGroup === null ? null : text(body.equalValueGroup, 24) || null; if (body.equalValueGroup !== null && value === null) return { ok: false, field: "equalValueGroup", reason: "invalid" }; patch.equal_value_group = value; }
  if ("groupSize" in body) { if (!isInt(body.groupSize) || body.groupSize < 1 || body.groupSize > MAX_GROUP_SIZE) return { ok: false, field: "groupSize", reason: "invalid" }; patch.group_size = body.groupSize; }
  if ("priority" in body) { if (!isInt(body.priority) || body.priority < 1 || body.priority > 5) return { ok: false, field: "priority", reason: "invalid" }; patch.priority = body.priority; }
  if ("isSelf" in body) { if (typeof body.isSelf !== "boolean") return { ok: false, field: "isSelf", reason: "invalid" }; patch.is_self = body.isSelf; }
  if ("isOptional" in body) { if (typeof body.isOptional !== "boolean") return { ok: false, field: "isOptional", reason: "invalid" }; patch.is_optional = body.isOptional; }
  if (!allowEmpty && !Object.keys(patch).length) return { ok: false, field: "patch", reason: "empty_patch" };
  return { ok: true, value: patch };
}

/* ── the AI's ops ──────────────────────────────────────────────────────── */

export type AppliedOp = { op: "add"; ref: string | null; patch: RecipientPatch; allocationCents: number | null; basis: "per_person" | "group_total" | null }
  | { op: "update"; ref: string; recipientId: string; patch: RecipientPatch; allocationCents: number | null; basis: "per_person" | "group_total" | null }
  | { op: "archive"; ref: string; recipientId: string };
export type OpRejection = { ref: string | null; field: string; reason: "unknown_recipient" | "ref_on_add" | "invalid" | "missing_name" | "duplicate_self" | "equal_value_conflict" };

/** Re-reads what `sanitizeRecipientOps` produced. The chat route sanitises for
 *  the model's sake; this runs again because the body arrives from a browser and
 *  a browser is not the chat route. */
export function planRecipientOps(raw: unknown, resolve: (ref: string) => string | null, known: { id: string; isSelf: boolean }[], currency: string): { ops: AppliedOp[]; rejected: OpRejection[] } {
  const ops: AppliedOp[] = [], rejected: OpRejection[] = [];
  let selfTaken = known.some((k) => k.isSelf);
  for (const entry of (Array.isArray(raw) ? raw : []).slice(0, MAX_RECIPIENT_OPS)) {
    const op = (entry ?? {}) as Partial<RecipientOp>;
    const kind = op.op, ref = typeof op.ref === "string" ? op.ref.slice(0, 8) : null;
    if (kind !== "add" && kind !== "update" && kind !== "remove") { rejected.push({ ref, field: "op", reason: "invalid" }); continue; }
    if (kind === "add" && ref) { rejected.push({ ref, field: "ref", reason: "ref_on_add" }); continue; }
    const recipientId = kind === "add" ? null : ref ? resolve(ref) : null;
    if (kind !== "add" && !recipientId) { rejected.push({ ref, field: "ref", reason: "unknown_recipient" }); continue; }
    if (kind === "remove") { ops.push({ op: "archive", ref: ref!, recipientId: recipientId! }); continue; }

    const fields = (op.fields ?? {}) as Record<string, unknown>;
    const clear = new Set(Array.isArray(op.clearFields) ? op.clearFields : []);
    const body: Record<string, unknown> = {};
    if (typeof fields.label === "string") body.name = fields.label;
    if (typeof fields.relationship === "string") body.relationship = fields.relationship;
    if (typeof fields.note === "string") body.preferenceNote = fields.note;
    if (typeof fields.equalValueGroup === "string") body.equalValueGroup = fields.equalValueGroup;
    else if (clear.has("equalValueGroup")) body.equalValueGroup = null;
    if (clear.has("note")) body.preferenceNote = null;
    if (fields.groupSize !== undefined) body.groupSize = fields.groupSize;
    if (fields.priority !== undefined) body.priority = fields.priority;
    if (fields.isSelf !== undefined) body.isSelf = fields.isSelf;
    if (fields.isOptional !== undefined) body.isOptional = fields.isOptional;

    const parsed = parseRecipientPatch(body, true);
    if (!parsed.ok) { rejected.push({ ref, field: parsed.field, reason: "invalid" }); continue; }
    const patch = parsed.value;
    if (patch.is_self) { const current = known.find((k) => k.id === recipientId); if (selfTaken && !current?.isSelf) { rejected.push({ ref, field: "isSelf", reason: "duplicate_self" }); delete patch.is_self; } else selfTaken = true; }
    if (kind === "add" && !patch.name) { rejected.push({ ref, field: "label", reason: "missing_name" }); continue; }

    // Whole units in, minor units of the trip's currency out — 30,000 yen is 30,000, not
    // 3,000,000. `clearFields` on the amount means "no allocation for this person",
    // which is a 0, not a skipped write.
    const unit = fields.allocationAmount;
    const allocationCents = typeof unit === "number" && Number.isInteger(unit) && unit >= 0 ? toMinor(unit, currency) : clear.has("allocationAmount") ? 0 : null;
    const basis = fields.allocationBasis === "per_person" || fields.allocationBasis === "group_total" ? fields.allocationBasis : null;
    if (kind === "add") ops.push({ op: "add", ref: null, patch, allocationCents, basis });
    else ops.push({ op: "update", ref: ref!, recipientId: recipientId!, patch, allocationCents, basis });
  }
  return { ops, rejected };
}

/** `r1` … `rN` over the trip's live recipients in creation order. The chat route
 *  mints refs the same way from the list the client sent it. */
export function refResolver(recipients: { id: string }[], supplied: Record<string, unknown> | null | undefined) {
  const positional = new Map(recipients.map((r, i) => [`r${i + 1}`, r.id]));
  const ids = new Set(recipients.map((r) => r.id));
  const explicit = new Map<string, string>();
  for (const [ref, id] of Object.entries(supplied ?? {})) if (typeof id === "string" && ids.has(id)) explicit.set(ref, id);
  return (ref: string) => explicit.get(ref) ?? positional.get(ref) ?? null;
}
