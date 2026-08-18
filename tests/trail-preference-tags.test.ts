import assert from "node:assert/strict";
import test from "node:test";
import { composeTurn, sanitizeBriefPatch, MAX_PREFERENCE_TAGS, PREFERENCE_TAGS, PREFERENCE_TAG_LABEL, ROUTE_TAGS, ROUTE_TAG_LABEL, TURN_SCHEMA, type TurnContext } from "../app/trail-brief.ts";
import { summaryRows } from "../app/(app)/ask/ready.ts";
import type { Trip, Wallet } from "../lib/state/types.ts";

// "Not touristy" used to have nowhere to live but `recipients.preference_note`, a free string the
// model wrote. Render that string on a card and the app prints the model's own copy back at the
// traveller as if it were their answer. These are the assertions that a preference is a value from
// a closed list, all the way from the model's output to the pixel.

const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({ trip: { city: "Toronto", country: "Canada", currency: "CAD" }, recipients: [], ...over });

test("a tag that is not in the enum never reaches the brief", () => {
  const { patch, rejected } = sanitizeBriefPatch({ preference_tags: ["local", "artisanal vibes", "not_touristy"] });
  assert.deepEqual(patch.preferenceTags, ["local", "not_touristy"]);
  assert.equal(rejected[0]?.field, "preference_tags");
  assert.equal(rejected[0]?.reason, "unknown_value");
  // No branch anywhere lets a free string through as itself.
  assert.equal(composeTurn({ reply: "ok", brief_patch: { preference_tags: ["<script>alert(1)</script>"] } }, ctx()).brief.preferenceTags?.length, 0);
});

test("duplicates collapse and the list is capped", () => {
  const { patch } = sanitizeBriefPatch({ preference_tags: ["local", "local", "handmade", "edible", "useful", "keepsake", "budget_friendly", "easy_to_pack", "not_touristy"] });
  assert.equal(new Set(patch.preferenceTags).size, patch.preferenceTags!.length);
  assert.ok(patch.preferenceTags!.length <= MAX_PREFERENCE_TAGS);
});

test("a route tag is not a product tag and cannot be smuggled in as one", () => {
  assert.equal(sanitizeBriefPatch({ preference_tags: ["moderate_walk"] }).patch.preferenceTags?.length, 0);
  assert.equal(sanitizeBriefPatch({ route_tag: "moderate_walk" }).patch.routeTag, "moderate_walk");
  assert.equal(sanitizeBriefPatch({ route_tag: "teleport" }).patch.routeTag, undefined);
});

test("every tag has a label, and every label has a tag", () => {
  // The card renders through the label map, so a tag with no label could not be drawn even if it
  // got this far — and a label with no tag is copy nothing can ever set.
  assert.ok(PREFERENCE_TAGS.every((tag) => typeof PREFERENCE_TAG_LABEL[tag] === "string" && PREFERENCE_TAG_LABEL[tag].length > 0));
  assert.equal(Object.keys(PREFERENCE_TAG_LABEL).length, PREFERENCE_TAGS.length);
  assert.ok(ROUTE_TAGS.every((tag) => typeof ROUTE_TAG_LABEL[tag] === "string"));
  assert.equal(Object.keys(ROUTE_TAG_LABEL).length, ROUTE_TAGS.length);
});

test("the schema offers the enum and no longer offers the two booleans", () => {
  const brief = JSON.stringify(TURN_SCHEMA.properties.brief_patch);
  assert.equal(brief.includes("local_only"), false);
  assert.equal(brief.includes("easy_pack"), false);
  assert.ok(brief.includes("preference_tags") && brief.includes("route_tag"));
  for (const tag of PREFERENCE_TAGS) assert.ok(brief.includes(`"${tag}"`), tag);
  // `clear` names the same fields the patch does, or a traveller could not undo one of them.
  const clear = JSON.stringify(TURN_SCHEMA.properties.clear);
  assert.ok(clear.includes("preference_tags") && clear.includes("route_tag"));
  assert.equal(clear.includes("local_only"), false);
  // `asked_field` keeps `local_only`/`easy_pack`: those are still the *questions* being asked,
  // and the answers are now tags. A question is not a column.
  assert.ok(JSON.stringify(TURN_SCHEMA.properties.asked_field).includes("local_only"));
});

const trip = { city: "Toronto", startDate: "2026-09-01", endDate: "2026-09-04", hotelName: "The Annex Hotel" } as Trip;
const wallet = { totalCents: 25000, reserveCents: 900, overPlan: false } as Wallet;

test("the summary card prints the label, never the raw tag", () => {
  const rows = summaryRows({ trip, wallet, recipients: [], preferenceTags: ["local", "not_touristy"], routeTag: "moderate_walk", currency: "CAD" });
  const preferences = rows.find((row) => row.label === "Preferences")!.value;
  assert.equal(preferences, "Local · Not touristy · Moderate walk");
  assert.equal(preferences.includes("not_touristy"), false);
});
