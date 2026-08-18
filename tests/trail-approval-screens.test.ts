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
const routing = read("next.config.ts");
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

// It used to be a page calling `permanentRedirect()`, which answered 200 with the
// redirect digest serialised into the document as an error — the traveller reached an
// error screen, not Split. A routing rule resolves before anything renders.
test("the old People route still resolves to the screen that replaced it", () => {
  assert.match(routing, /source:\s*"\/trail\/plan\/people"/);
  assert.match(routing, /destination:\s*"\/trail\/plan\/gifts\/split"/);
  assert.match(routing, /permanent:\s*true/);
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

/* ── N3: the ranking is on this screen and nowhere else ─────────────────── */

test("every recipient carries the three-tier segment, grouped as one question", () => {
  assert.match(people, /<fieldset className="priority-set">/);
  assert.match(people, /<legend className="section-label">If money runs short/);
  assert.match(people, /TIERS\.map\(\(tier\) =>/, "the three tiers come from lib/budget/priority, not from three hand-written labels");
  assert.match(people, /type="radio" name={`prio-\$\{person\.id\}`}/);
  // Selection is never border colour alone.
  assert.match(people, /choice-check/);
});

test("a mark is one write of both columns, and it is not gated on approval", () => {
  assert.match(people, /updateRecipient\(person\.id, tierWrite\(tier\)\)/);
  assert.equal(/checked=\{tierFor\(person\) === tier\}[^>]*disabled/.test(people), false, "priority moves no money, so an approved plan does not lock it");
  // Failure is reverted and said out loud: `updateRecipient` does not go through the outbox.
  assert.match(people, /That mark was not saved/);
  assert.match(people, /Trail could not save that mark/);
});

test("the trim suggestion fills the inputs and saves nothing", () => {
  assert.match(people, /Suggest a split that keeps the must-buys/);
  assert.match(people, /trimToFit\(/);
  assert.match(people, /Nothing is saved yet/);
  // The remedy sets rows; only the existing button sends, through the existing 409.
  assert.equal(/applyTrim[\s\S]{0,400}saveAllocations/.test(people), false, "the trim button must not send the split");
  assert.match(people, /Raise it for approval/, "the flexible path is unchanged");
  assert.match(people, /Even the must-buy gifts come to/, "a no_fit says so instead of drawing a button");
});

test("no new approval path was opened for a ranking", () => {
  assert.equal(/proposeBudgetChange\([^)]*priority/.test(people), false);
  assert.equal(people.includes("reserve_short"), false, "the delivery reserve is a different bucket");
});
