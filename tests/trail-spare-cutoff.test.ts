import assert from "node:assert/strict";
import test from "node:test";
import { ineligibleCopy } from "../app/(app)/view.ts";
import { CLOSING_SOON_MINUTES, cutoffBanner, cutoffStateOf, rankSpare } from "../lib/discovery/window.ts";

// The drop-off cut-off is a fact about the city and the clock. It gets one line above the
// list, it changes the order underneath, and it never removes a row.

test("the four states come off the server's own numbers", () => {
  assert.equal(cutoffStateOf({ minutesToCutoff: -5, partnerCount: 2 }), "passed");
  assert.equal(cutoffStateOf({ minutesToCutoff: 0, partnerCount: 2 }), "passed");
  assert.equal(cutoffStateOf({ minutesToCutoff: CLOSING_SOON_MINUTES, partnerCount: 2 }), "closing_soon");
  assert.equal(cutoffStateOf({ minutesToCutoff: CLOSING_SOON_MINUTES + 1, partnerCount: 2 }), "open");
  assert.equal(cutoffStateOf({ partnerCount: 0 }), "unknown", "no counter in the city means there is no cut-off to be past");
  assert.equal(cutoffStateOf({ minutesToCutoff: null, partnerCount: 3 }), "unknown", "not knowing is a state, not `open`");
});

test("the banner reuses the refusal copy instead of writing its own", () => {
  // Two screens describing one fact in two voices is how a six-code vocabulary becomes
  // twelve. String equality, so a reword on either side fails here first.
  assert.equal(cutoffBanner({ minutesToCutoff: -5 })?.title, ineligibleCopy.cutoff_passed.title);
  assert.equal(cutoffBanner({ partnerCount: 0 })?.title, ineligibleCopy.no_partner_nearby.title);
  assert.equal(cutoffBanner({ minutesToCutoff: 20, partnerCount: 1 })?.title, "Drop-off closes soon");
  assert.equal(cutoffBanner({ minutesToCutoff: 300, partnerCount: 1 }), null, "an open run says nothing at all");
});

test("the banner never carries an amount", () => {
  // FIGMA_ADOPTION §1.4: what a transfer costs is quoted by the server on the screen that
  // charges for it. A banner that prices the delivery is a banner that guessed.
  for (const input of [{ minutesToCutoff: -5 }, { minutesToCutoff: 10, partnerCount: 1 }, { partnerCount: 0 }]) {
    const text = JSON.stringify(cutoffBanner(input));
    assert.equal(/[$€£¥₩]|\d+\s*(CAD|USD|KRW|JPY|EUR|GBP)/.test(text), false, text);
  }
});

const products = [
  { id: "a-mug", handling: "Fragile" as const, weightGrams: 400, walk: 4 },
  { id: "b-tea", handling: "Standard" as const, weightGrams: 200, walk: 4 },
  { id: "c-jam", handling: "Chilled" as const, weightGrams: 300, walk: 4 },
];

test("a closed cut-off reorders the list and shortens it by nothing", () => {
  const ranked = rankSpare(products, { minutesLeft: 90, cutoffState: "passed" });
  assert.equal(ranked.length, products.length, "shopping does not stop when the bag run does");
  const at = (id: string) => ranked.findIndex((row) => row.id === id);
  assert.ok(at("b-tea") < at("a-mug"), "fragile sinks once the traveller is the one carrying it");
  assert.ok(at("b-tea") < at("c-jam"));
  // Nothing moves while the run is still open — the ids are already alphabetical, so a
  // difference here would be the cut-off leaking into a state it does not apply to.
  assert.deepEqual(rankSpare(products, { minutesLeft: 90, cutoffState: "open" }).map((row) => row.id), ["a-mug", "b-tea", "c-jam"]);
});
