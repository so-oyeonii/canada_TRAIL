import assert from "node:assert/strict";
import test from "node:test";
import { parseRecipientCreate, parseRecipientPatch, planRecipientOps, refResolver } from "../lib/recipients/input.ts";
import { sanitizeRecipientOps, type TurnContext } from "../app/trail-brief.ts";
import { carriesIdentity } from "../lib/api/http.ts";

// Two halves: what a screen may send about a recipient, and what a chat turn is
// allowed to do to one. The second half runs the model's own output through the
// route's parser, because the body arrives from a browser, not from the AI.

const KNOWN = [{ id: "id-a", isSelf: false }, { id: "id-b", isSelf: false }, { id: "id-c", isSelf: true }];
const ROWS = [{ id: "id-a" }, { id: "id-b" }, { id: "id-c" }];
const resolve = refResolver(ROWS, null);
const plan = (ops: unknown[], known = KNOWN, currency = "CAD") => planRecipientOps(ops, resolve, known, currency);

test("a create needs a name and nothing else", () => {
  const parsed = parseRecipientCreate({ name: "  Mom  " });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value, { name: "Mom", relationship: "", group_size: 1, priority: 3, is_self: false, is_optional: false, preference_note: "", equal_value_group: null });
});

test("a nameless recipient is a 400, not an untitled row", () => {
  for (const bad of [undefined, "", "   ", 42]) assert.equal(parseRecipientCreate({ name: bad }).ok, false);
});

test("out-of-range group size and priority are refused rather than clamped", () => {
  assert.equal(parseRecipientCreate({ name: "team", groupSize: 0 }).ok, false);
  assert.equal(parseRecipientCreate({ name: "team", groupSize: 31 }).ok, false);
  assert.equal(parseRecipientCreate({ name: "team", groupSize: 12 }).ok, true);
  assert.equal(parseRecipientPatch({ priority: 6 }).ok, false);
});

test("an empty patch is refused: a write that changes nothing is a client bug", () => {
  assert.equal(parseRecipientPatch({}).ok, false);
  assert.equal(parseRecipientPatch({ note: "not a field" }).ok, false);
});

test("clearing the equal-value tag and omitting it are different instructions", () => {
  const cleared = parseRecipientPatch({ equalValueGroup: null });
  assert.ok(cleared.ok);
  assert.equal("equal_value_group" in cleared.value, true);
  assert.equal(cleared.value.equal_value_group, null);
  const omitted = parseRecipientPatch({ name: "Mom" });
  assert.ok(omitted.ok);
  assert.equal("equal_value_group" in omitted.value, false);
});

test("a body that names a user is refused before any of this runs", () => {
  assert.equal(carriesIdentity({ name: "Mom", user_id: "u-1" }), true);
  assert.equal(carriesIdentity({ ops: [{ op: "add", fields: { userId: "u-1" } }] }), true);
  assert.equal(carriesIdentity({ name: "Mom", groupSize: 2 }), false);
});

/* ── the AI's ops ──────────────────────────────────────────────────────── */

test("refs resolve by creation order, and an unknown one never becomes a new person", () => {
  const { ops, rejected } = plan([{ op: "update", ref: "r2", fields: { priority: 1 }, clearFields: [] }, { op: "update", ref: "r9", fields: { priority: 1 }, clearFields: [] }]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op === "update" ? ops[0].recipientId : "", "id-b");
  assert.equal(rejected[0].reason, "unknown_recipient");
});

test("an explicit ref map wins over position", () => {
  const mapped = refResolver(ROWS, { r1: "id-c", r9: "not-in-this-trip" });
  assert.equal(mapped("r1"), "id-c");
  assert.equal(mapped("r9"), null, "a ref pointing outside the trip resolves to nobody");
});

test("whole units become cents and nothing is rounded to ten", () => {
  const { ops } = plan([{ op: "update", ref: "r1", fields: { allocationAmount: 58 }, clearFields: [] }]);
  assert.equal(ops[0].op === "update" ? ops[0].allocationCents : 0, 5800);
});

// The AI writes these amounts straight to `plan_allocations`, so a hundredfold here is a
// hundredfold on the server, not on a screen that a refresh would fix.
test("a whole-unit allocation is read in the trip's currency, not always in cents", () => {
  const ops = (currency: string) => plan([{ op: "update", ref: "r1", fields: { allocationAmount: 3000 }, clearFields: [] }], KNOWN, currency).ops;
  const cents = (list: ReturnType<typeof ops>) => (list[0].op === "update" ? list[0].allocationCents : null);
  assert.equal(cents(ops("CAD")), 300000);
  assert.equal(cents(ops("JPY")), 3000);
  assert.equal(cents(ops("KRW")), 3000);
  assert.equal(cents(ops("EUR")), 300000);
});

test("a per-person amount keeps its basis for the route to multiply out", () => {
  const { ops } = plan([{ op: "update", ref: "r1", fields: { allocationAmount: 39, allocationBasis: "per_person" }, clearFields: [] }]);
  assert.equal(ops[0].op === "update" ? ops[0].basis : null, "per_person");
});

test("clearing an amount is a zero, not a skipped write", () => {
  const { ops } = plan([{ op: "update", ref: "r1", fields: {}, clearFields: ["allocationAmount"] }]);
  assert.equal(ops[0].op === "update" ? ops[0].allocationCents : null, 0);
});

test("a second Myself is refused and the rest of the op still lands", () => {
  const { ops, rejected } = plan([{ op: "update", ref: "r1", fields: { isSelf: true, priority: 2 }, clearFields: [] }]);
  assert.equal(rejected[0].reason, "duplicate_self");
  assert.equal(ops[0].op === "update" ? ops[0].patch.is_self : true, undefined);
  assert.equal(ops[0].op === "update" ? ops[0].patch.priority : 0, 2);
});

test("an add carrying a ref is refused: the model does not get to name rows", () => {
  const { ops, rejected } = plan([{ op: "add", ref: "r4", fields: { label: "Dad" }, clearFields: [] }]);
  assert.equal(ops.length, 0);
  assert.equal(rejected[0].reason, "ref_on_add");
});

test("an add with no label is refused rather than stored as an empty person", () => {
  const { rejected } = plan([{ op: "add", ref: null, fields: { priority: 2 }, clearFields: [] }]);
  assert.equal(rejected[0].reason, "missing_name");
});

test("remove becomes an archive, never a delete", () => {
  const { ops } = plan([{ op: "remove", ref: "r1", fields: {}, clearFields: [] }]);
  assert.equal(ops[0].op, "archive");
});

test("at most eight ops are read from one turn", () => {
  const { ops } = plan(Array.from({ length: 12 }, () => ({ op: "update", ref: "r1", fields: { priority: 2 }, clearFields: [] })));
  assert.equal(ops.length, 8);
});

test("what the chat route sanitises still passes through the route's own parser", () => {
  // The body arrives from a browser. Being sanitised once, somewhere else, is not a guarantee.
  const ctx: TurnContext = { trip: { city: "Toronto", country: "Canada", currency: "CAD" }, recipients: [{ ref: "r1", label: "Mom" }, { ref: "r2", label: "friend A" }, { ref: "r3", label: "friend B" }], plannedUnits: 250 };
  const { apply } = sanitizeRecipientOps([{ op: "update", ref: "r1", allocation_amount: 58 }, { op: "update", ref: "r2", allocation_amount: 68 }], ctx);
  const { ops, rejected } = plan(apply);
  assert.equal(rejected.length, 0);
  assert.deepEqual(ops.map((o) => (o.op === "update" ? o.allocationCents : null)), [5800, 6800]);
});

test("garbage in the ops array is dropped with a reason and never applied", () => {
  const { ops, rejected } = plan([{ op: "delete", ref: "r1" }, null, { fields: {} }]);
  assert.equal(ops.length, 0);
  assert.equal(rejected.length, 3);
});
