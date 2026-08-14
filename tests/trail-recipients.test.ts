import assert from "node:assert/strict";
import test from "node:test";
import { allocationOverrun, composeTurn, sanitizeRecipientOps, type KnownRecipient, type TurnContext } from "../app/trail-brief.ts";

// One trip, five recipients, three of them constrained against each other. Every case below is a
// way the model can quietly rewrite someone it was not asked about.

const FIGMA: KnownRecipient[] = [
  { ref: "r1", label: "Mom", relationship: "Mom", groupSize: 1, priority: 1, allocation: 58, category: "Home & design", note: "already has a ceramic teapot" },
  { ref: "r2", label: "friend A", groupSize: 1, priority: 3, allocation: 68, equalValueGroup: "friends" },
  { ref: "r3", label: "friend B", groupSize: 1, priority: 3, allocation: 68, equalValueGroup: "friends" },
  { ref: "r4", label: "work team", groupSize: 12, priority: 4, allocation: 39, allocationBasis: "group_total" },
  { ref: "r5", label: "Myself", isSelf: true, isOptional: true, allocation: 45 },
];

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({ trip: { city: "Toronto", country: "Canada", areas: ["Kensington Market"], currency: "CAD" }, recipients: FIGMA, plannedUnits: 250, ...over });
const ops = (raw: unknown[], over: Partial<TurnContext> = {}) => sanitizeRecipientOps(raw, ctx(over));

test("an update touches its own recipient and no one else", () => {
  const { apply } = ops([{ op: "update", ref: "r2", allocation_amount: 68 }]);
  assert.equal(apply.length, 1);
  assert.equal(apply[0].ref, "r2");
  assert.deepEqual(Object.keys(apply[0].fields), ["allocationAmount"]);
});

test("the whole figma set lands in one turn", () => {
  const { apply, rejected } = ops([
    { op: "update", ref: "r1", allocation_amount: 58 },
    { op: "update", ref: "r2", allocation_amount: 68, equal_value_group: "friends" },
    { op: "update", ref: "r3", allocation_amount: 68, equal_value_group: "friends" },
    { op: "update", ref: "r4", allocation_amount: 39, allocation_basis: "group_total" },
    { op: "update", ref: "r5", allocation_amount: 45 },
  ], { plannedUnits: 300 });
  assert.equal(rejected.length, 0);
  assert.equal(apply.reduce((sum, op) => sum + (op.fields.allocationAmount ?? 0), 0), 278);
});

test("an unknown ref is rejected and never promoted into a new person", () => {
  const { apply, rejected } = ops([{ op: "update", ref: "r9", allocation_amount: 40 }]);
  assert.deepEqual(apply, []);
  assert.equal(rejected[0]?.reason, "unknown_recipient");
});

test("an add that carries a ref is a contract violation", () => {
  const { apply, rejected } = ops([{ op: "add", ref: "r3", label: "My brother" }]);
  assert.deepEqual(apply, []);
  assert.equal(rejected[0]?.reason, "ref_on_add");
});

test("an add without a ref is a new draft recipient", () => {
  const { apply, rejected } = ops([{ op: "add", ref: null, label: "My brother", group_size: 1 }]);
  assert.equal(rejected.length, 0);
  assert.equal(apply[0].fields.label, "My brother");
  assert.equal(apply[0].ref, null);
});

test("a removal is only ever a proposal", () => {
  const { apply, confirm } = ops([{ op: "remove", ref: "r4" }]);
  assert.deepEqual(apply, []);
  assert.equal(confirm[0]?.ref, "r4");
  assert.equal(confirm[0]?.op, "remove");
});

test("a field that is set and cleared in the same turn keeps its value", () => {
  const { apply } = ops([{ op: "update", ref: "r2", allocation_amount: 68, clear_fields: ["allocation_amount"] }]);
  assert.equal(apply[0].fields.allocationAmount, 68);
  assert.deepEqual(apply[0].clearFields, []);
});

test("clearing one field leaves the others on that recipient alone", () => {
  const { apply } = ops([{ op: "update", ref: "r1", clear_fields: ["note"] }]);
  assert.deepEqual(apply[0].clearFields, ["note"]);
  assert.deepEqual(apply[0].fields, {});
});

test("equal-value gifts with different amounts are both refused, not levelled up", () => {
  const { apply, rejected } = ops([
    { op: "update", ref: "r2", allocation_amount: 68 },
    { op: "update", ref: "r3", allocation_amount: 52 },
  ]);
  assert.equal(apply[0].fields.allocationAmount, undefined);
  assert.equal(apply[1].fields.allocationAmount, undefined);
  assert.equal(rejected.filter((item) => item.reason === "equal_value_conflict").length, 2);
});

test("equal value is all or nothing: half a group is a conflict", () => {
  const half = FIGMA.map((person) => (person.ref === "r3" ? { ...person, allocation: undefined } : person));
  const { apply, rejected } = ops([{ op: "update", ref: "r2", allocation_amount: 68 }], { recipients: half });
  assert.equal(apply[0].fields.allocationAmount, undefined);
  assert.equal(rejected[0]?.reason, "equal_value_conflict");
});

test("a group of twelve is one entry, and the basis decides what the amount means", () => {
  const perPerson = ops([{ op: "update", ref: "r4", allocation_amount: 39, allocation_basis: "per_person" }]);
  assert.equal(perPerson.apply[0].fields.allocationAmount, 39);
  assert.equal(allocationOverrun(perPerson.apply, ctx({ plannedUnits: 250 }))?.allocatedUnits, 39 * 12 + 58 + 68 + 68 + 45);
  const groupTotal = ops([{ op: "update", ref: "r4", allocation_amount: 39, allocation_basis: "group_total" }]);
  assert.equal(allocationOverrun(groupTotal.apply, ctx({ plannedUnits: 250 }))?.allocatedUnits, 278);
});

test("an amount on a group with no basis is refused rather than guessed", () => {
  // 39 for a team of twelve is either 39 or 468. Picking one is a 429-dollar assumption.
  const noBasis = FIGMA.map((person) => (person.ref === "r4" ? { ...person, allocationBasis: undefined } : person));
  const { apply, rejected } = ops([{ op: "update", ref: "r4", allocation_amount: 39 }], { recipients: noBasis });
  assert.equal(apply[0].fields.allocationAmount, undefined);
  assert.equal(rejected[0]?.reason, "ambiguous_basis");
});

test("allocations over the shopping bucket still land, but the excess needs a tap", () => {
  const reply = composeTurn({ reply: "That is more than the draft holds.", recipients: [{ op: "update", ref: "r1", allocation_amount: 200 }] }, ctx({ plannedUnits: 250 }));
  assert.equal(reply.recipientOps[0].fields.allocationAmount, 200);
  assert.equal(reply.confirm.budget?.overUnits, 200 + 68 + 68 + 39 + 45 - 250);
});

test("an approved plan takes no automatic writes", () => {
  const { apply, confirm, rejected } = ops([{ op: "update", ref: "r1", allocation_amount: 60 }], { planApproved: true });
  assert.deepEqual(apply, []);
  assert.equal(confirm.length, 1);
  assert.equal(rejected[0]?.reason, "plan_approved");
});

test("a label is stripped of control characters and truncated before it reaches a prompt", () => {
  const raw = `My${String.fromCharCode(0)}mom${String.fromCharCode(31)}` + " " + "x".repeat(80);
  const { apply } = ops([{ op: "add", ref: null, label: raw }]);
  assert.equal(apply[0].fields.label?.length, 40);
  assert.equal(apply[0].fields.label?.startsWith("My mom x"), true);
});

test("only one recipient can be the traveler themselves", () => {
  const { apply, rejected } = ops([{ op: "update", ref: "r1", is_self: true }]);
  assert.equal(apply[0].fields.isSelf, undefined);
  assert.equal(rejected[0]?.reason, "duplicate_self");
  // r5 is already the self recipient, so re-stating it is not a duplicate.
  assert.equal(ops([{ op: "update", ref: "r5", is_self: true }]).apply[0].fields.isSelf, true);
});

test("junk ops are dropped without taking the good ones with them", () => {
  const { apply, rejected } = ops([{ op: "sell", ref: "r1" }, null, { op: "update", ref: "r1", priority: 9 }, { op: "update", ref: "r1", category: "Jewellery" }]);
  assert.equal(apply.length, 2);
  assert.equal(apply[0].fields.priority, undefined);
  assert.equal(apply[1].fields.category, undefined);
  assert.equal(rejected.length, 2);
});
