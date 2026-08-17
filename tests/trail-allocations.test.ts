import assert from "node:assert/strict";
import test from "node:test";
import { decideAllocations, equalValueConflicts, parseAllocationsBody, resolveAllocations, type AllocationPerson } from "../lib/budget/allocations.ts";

// The figma trip: Mom 58, friend A 68, friend B 68, work team 39 each, myself 45.
// Every case below is a way the split can quietly stop being the numbers she said.

const PEOPLE: AllocationPerson[] = [
  { id: "a", name: "Mom", groupSize: 1, equalValueGroup: null },
  { id: "b", name: "friend A", groupSize: 1, equalValueGroup: "friends" },
  { id: "c", name: "friend B", groupSize: 1, equalValueGroup: "friends" },
  { id: "d", name: "work team", groupSize: 12, equalValueGroup: null },
  { id: "e", name: "Myself", groupSize: 1, equalValueGroup: null },
];

const entry = (recipientId: string, cents: number, over: Record<string, unknown> = {}) => ({ recipientId, amountCents: cents, ...over });
const parse = (rows: unknown[], over: Record<string, unknown> = {}) => parseAllocationsBody({ allocations: rows, ...over });

test("the figma split lands cent for cent, with no ten-unit snap anywhere", () => {
  const parsed = parse([entry("a", 5800), entry("b", 6800), entry("c", 6800), entry("e", 4500)]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 30000 });
  assert.equal(verdict.verdict, "apply");
  assert.deepEqual(verdict.verdict === "apply" ? verdict.resolved.map((r) => r.amountCents) : [], [5800, 6800, 6800, 4500]);
  // 58 + 68 + 68 + 45 = 239, not the 240 that rounding to ten would have produced.
  assert.equal(verdict.verdict === "apply" ? verdict.allocatedCents : 0, 23900);
});

test("per_person on a group of twelve is stored as the group total", () => {
  const parsed = parse([entry("d", 3900, { basis: "per_person" })]);
  assert.ok(parsed.ok);
  const resolved = resolveAllocations(parsed.value.entries, new Map(PEOPLE.map((p) => [p.id, p])));
  assert.equal(resolved[0].amountCents, 46800);
  assert.equal(resolved[0].unitAmountCents, 3900, "what she typed survives in the response");
});

test("group_total on the same group is left exactly alone", () => {
  const parsed = parse([entry("d", 3900)]);
  assert.ok(parsed.ok);
  const resolved = resolveAllocations(parsed.value.entries, new Map(PEOPLE.map((p) => [p.id, p])));
  assert.equal(resolved[0].amountCents, 3900);
});

test("an equal-value group on two different numbers is refused, not levelled up", () => {
  const parsed = parse([entry("b", 6800), entry("c", 5000)]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 100000 });
  assert.equal(verdict.verdict, "equal_value_conflict");
  if (verdict.verdict !== "equal_value_conflict") return;
  assert.equal(verdict.conflicts[0].group, "friends");
  assert.deepEqual(verdict.conflicts[0].members.map((m) => [m.name, m.amountCents]), [["friend A", 6800], ["friend B", 5000]]);
});

test("a tagged recipient left out of the replacement conflicts too", () => {
  // Absent is not "agrees": friend B would silently end the turn on nothing.
  const parsed = parse([entry("b", 6800)]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 100000 });
  assert.equal(verdict.verdict, "equal_value_conflict");
});

test("an equal-value group that agrees goes through", () => {
  assert.equal(equalValueConflicts(resolveAllocations([{ recipientId: "b", unitAmountCents: 6800, basis: "group_total", bucket: "planned" }, { recipientId: "c", unitAmountCents: 6800, basis: "group_total", bucket: "planned" }], new Map(PEOPLE.map((p) => [p.id, p]))), PEOPLE).length, 0);
});

test("over the shopping bucket is a proposal and never a trimmed recipient", () => {
  const parsed = parse([entry("a", 5800), entry("b", 6800), entry("c", 6800), entry("e", 4500)]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 20000 });
  assert.equal(verdict.verdict, "exceeds_planned");
  if (verdict.verdict !== "exceeds_planned") return;
  assert.equal(verdict.overCents, 3900);
  assert.deepEqual(verdict.resolved.map((r) => r.amountCents), [5800, 6800, 6800, 4500], "nobody is scaled down to fit");
});

test("a conflict is answered before a shortfall", () => {
  const parsed = parse([entry("b", 900000), entry("c", 5000)]);
  assert.ok(parsed.ok);
  assert.equal(decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 1000 }).verdict, "equal_value_conflict");
});

test("a recipient this trip does not have is a 400, not an invented row", () => {
  const parsed = parse([entry("ghost", 5000)]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 100000 });
  assert.equal(verdict.verdict, "unknown_recipient");
});

test("the same recipient twice is a named failure, not a last-write-wins merge", () => {
  const parsed = parse([entry("a", 5000), entry("a", 6000)]);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.ok === false ? parsed.reason : "", "duplicate");
  assert.equal(parsed.ok === false ? parsed.field : "", "allocations[1].recipientId");
});

test("cents are integers or they are a 400", () => {
  for (const bad of [58.5, -100, "5800", null, 10_000_001]) assert.equal(parse([entry("a", bad as number)]).ok, false, `${bad} was accepted`);
});

test("an empty list is a valid replacement: it clears the split", () => {
  const parsed = parse([]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 20000 });
  assert.equal(verdict.verdict, "apply");
  assert.equal(verdict.verdict === "apply" ? verdict.allocatedCents : -1, 0);
});

test("a missing allocations array is a 400 rather than an empty replacement", () => {
  assert.equal(parseAllocationsBody({}).ok, false);
});

test("only the planned bucket counts against what can be spent", () => {
  const parsed = parse([entry("a", 5000), entry("e", 90000, { bucket: "flexible" })]);
  assert.ok(parsed.ok);
  const verdict = decideAllocations({ entries: parsed.value.entries, people: PEOPLE, plannedCents: 6000 });
  assert.equal(verdict.verdict, "apply");
  assert.equal(verdict.verdict === "apply" ? verdict.allocatedCents : -1, 5000);
});

test("a client op id travels with the replacement so a replay is the same write", () => {
  const parsed = parse([entry("a", 5000)], { clientOpId: "op-42" });
  assert.equal(parsed.ok && parsed.value.clientOpId, "op-42");
  assert.equal(parse([entry("a", 5000)], { clientOpId: 42 }).ok, false);
});
