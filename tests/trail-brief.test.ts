import assert from "node:assert/strict";
import test from "node:test";
import { inferPlanPatch, sanitizePatch, BUDGET_MAX, BUDGET_MIN } from "../app/trail-brief.ts";

// Keyword inference only ever produces a *suggestion* the traveler taps to accept.
// These cases pin the failures that used to write straight into the brief.

test("reads recipient, count and budget from a plain request", () => {
  const patch = inferPlanPatch("I want a thoughtful local gift for my mom under CAD 80.");
  assert.equal(patch.recipient, "My mom");
  assert.equal(patch.quantity, 1);
  assert.equal(patch.budget, 80);
  assert.equal(patch.preference, "Thoughtful and personal");
});

test("counts two gifts for friends", () => {
  const patch = inferPlanPatch("I need two different but equal-value gifts for my friends.");
  assert.equal(patch.recipient, "My friends");
  assert.equal(patch.quantity, 2);
  assert.equal(patch.budget, undefined);
});

test("a negated message infers nothing at all", () => {
  // Used to set category to "Food & treats" — the exact opposite of what was said.
  assert.deepEqual(inferPlanPatch("Actually not chocolate - she is allergic."), {});
  assert.deepEqual(inferPlanPatch("초콜릿은 말고 다른 걸로."), {});
  assert.deepEqual(inferPlanPatch("Something local, without ceramics please."), {});
});

test("'useful' describes a preference, never a category", () => {
  const patch = inferPlanPatch("Something useful for my mom.");
  assert.equal(patch.category, undefined);
  assert.equal(patch.preference, "Practical and useful");
});

test("the last matching keyword no longer overwrites the first", () => {
  // "team" wins over "friend" by priority rather than by source-line order.
  assert.equal(inferPlanPatch("Snacks to share with my lab team").recipient, "My lab team");
  assert.equal(inferPlanPatch("A gift for my mom").recipient, "My mom");
});

test("a stock or opening-hours question infers nothing", () => {
  assert.deepEqual(inferPlanPatch("Is Blue Banana open right now and do they have the maple box?"), {});
});

test("picks up a Korean budget even when the recipient words are not matched", () => {
  const patch = inferPlanPatch("엄마 선물 하나, 예산 CAD 90.");
  assert.equal(patch.budget, 90);
});

test("an out-of-range budget is rejected, not silently clamped", () => {
  // Clamping 5000 to 300 would put a number in the brief the traveler never said.
  const { patch, rejected } = sanitizePatch({ budget: 5000 });
  assert.equal(patch.budget, undefined);
  assert.equal(rejected[0]?.field, "budget");
  assert.equal(rejected[0]?.reason, "out_of_range");

  assert.equal(sanitizePatch({ budget: BUDGET_MIN - 10 }).patch.budget, undefined);
  assert.equal(sanitizePatch({ budget: BUDGET_MAX }).patch.budget, BUDGET_MAX);
});

test("budget snaps to the slider's ten-dollar steps", () => {
  assert.equal(sanitizePatch({ budget: 84 }).patch.budget, 80);
  assert.equal(sanitizePatch({ budget: 86 }).patch.budget, 90);
});

test("unknown enum values are rejected instead of reaching the brief", () => {
  const { patch, rejected } = sanitizePatch({ category: "Jewellery", preference: "Fancy" });
  assert.equal(patch.category, undefined);
  assert.equal(patch.preference, undefined);
  assert.equal(rejected.length, 2);
});

test("quantity stays within one and thirty", () => {
  assert.equal(sanitizePatch({ quantity: 0 }).patch.quantity, undefined);
  assert.equal(sanitizePatch({ quantity: 31 }).patch.quantity, undefined);
  assert.equal(sanitizePatch({ quantity: 12 }).patch.quantity, 12);
});

test("recipient is trimmed of control characters before it reaches a prompt", () => {
  const raw = `My${String.fromCharCode(0)}mom${String.fromCharCode(31)}`;
  assert.equal(sanitizePatch({ recipient: raw }).patch.recipient, "My mom");
});

test("nulls and junk are dropped rather than stored", () => {
  const { patch } = sanitizePatch({ recipient: null, quantity: null, budget: null, category: null, localOnly: null });
  assert.deepEqual(patch, {});
  assert.deepEqual(sanitizePatch(undefined).patch, {});
});
