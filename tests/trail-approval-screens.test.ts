import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The T4 screens. The server side of recipients and allocations has been done
// since `693f406`; these are the assertions that the screens in front of it keep
// the same promises — nothing rounded, nothing over the bucket written, and the
// tap in exactly one place.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// The split screen moved to `Gifts ▸ Split` when the lenses went from five to four
// (FIGMA_ADOPTION §2). Body unchanged — these assertions are the reason it was moved
// rather than rewritten, and `/trail/plan/people` is now a 308 to here.
const people = read("app/(app)/trail/plan/gifts/split/page.tsx");
const peopleStub = read("app/(app)/trail/plan/people/page.tsx");
const approval = read("app/(app)/trail/plan/approval/page.tsx");
const layout = read("app/(app)/trail/plan/layout.tsx");
const state = read("app/(app)/app-state.tsx");

test("the split screen never snaps an amount to ten", () => {
  assert.ok(!/\/\s*10\s*\)\s*\*\s*10|Math\.round\([^)]*\/\s*10\)/.test(people), "the slider's ten-dollar snap is back in the allocation screen");
  // The typed number goes to minor units through the currency table and nothing else.
  // It used to read `Math.round(Number(amount) * 100)`, which was the same promise made
  // to CAD only — a yen amount came out a hundredfold.
  assert.match(people, /toMinor\(Number\(value\), currency\)/);
  assert.ok(!/\*\s*100/.test(people), "a hard 100 is back in the allocation screen");
});

test("a group's amount says what it means before it is sent", () => {
  assert.ok(/basis/.test(people) && /per_person/.test(people) && /group_total/.test(people), "the basis has to be on the screen, not guessed by the route");
  assert.ok(/groupSize > 1/.test(people), "the basis question only makes sense for a group");
});

test("going over the bucket is a proposal on screen too, never a saved split", () => {
  assert.match(people, /exceeds_planned/);
  assert.match(people, /proposeBudgetChange\(/);
  assert.ok(/coveredByFlexible/.test(people), "the screen must say when flexible cannot cover it");
  // The overrun panel offers approval; it never writes the split itself.
  assert.ok(!/saveAllocations\([^)]*force|clamp/i.test(people), "the screen must not trim an allocation to fit");
});

test("an equal-value conflict names who disagreed instead of levelling them up", () => {
  assert.match(people, /equal_value_conflict/);
  assert.ok(/conflict\.amounts/.test(people), "the amounts that disagreed have to be shown");
});

test("only the approval screen decides a budget change", () => {
  assert.match(approval, /decideBudgetChange\(/);
  assert.ok(!/decideBudgetChange\(/.test(people), "the split screen must route to the approval screen, not decide there");
  assert.ok(/"approve"/.test(approval) && /"reject"/.test(approval), "declining is a decision and needs its own button");
});

test("the proposal is shown as a proposal", () => {
  assert.ok(/None of this has happened/.test(approval), "the screen must say nothing has moved yet");
  assert.ok(/status === "503"|status === 503/.test(approval), "a missing service key must not read as an approval");
});

test("the old People route still resolves to the screen that replaced it", () => {
  assert.match(peopleStub, /permanentRedirect\("\/trail\/plan\/gifts\/split"\)/);
});

test("a waiting approval interrupts every plan lens", () => {
  assert.match(layout, /pendingBudgetChange/);
  assert.match(layout, /trail\/plan\/approval/);
});

test("the client reads recipients and the pending change from the server state", () => {
  for (const key of ["recipients", "budgetChanges", "pendingBudgetChange"]) assert.ok(new RegExp(`${key} = view\\?\\.${key}`).test(state), `${key} must come from GET /api/state`);
  // None of the money paths are queued: a proposal the traveller never saw
  // because it sat in the outbox is the approval gate failing quietly.
  assert.ok(!/commit\("(PUT|POST)", `\/api\/(plans|budget-changes|recipients)/.test(state), "a budget decision must not go through the outbox");
});
