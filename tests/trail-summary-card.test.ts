import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { summaryRows } from "../app/(app)/ask/ready.ts";
import { briefContext, SYSTEM_PROMPT, type TurnContext } from "../app/trail-brief.ts";
import type { Recipient, Trip, Wallet } from "../lib/state/types.ts";

// FIGMA_ADOPTION §1-4: the AI never states what a delivery costs, because that number is a
// city-by-city quote it has not been told. The wireframe still shows `Delivery — CAD $9 reserved`,
// and the way both are true at once is that the *client* draws it. These cases hold that line from
// both ends: the card must move when the reserve moves, and the prompt must not.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const trip = { city: "Toronto", startDate: "2026-09-01", endDate: "2026-09-04", hotelName: "The Annex Hotel" } as Trip;
const wallet = (over: Partial<Wallet> = {}) => ({ totalCents: 25000, plannedCents: 21000, reserveCents: 900, flexibleCents: 3100, spentCents: 0, spendableCents: 21000, unallocatedCents: 21000, allocatedCents: 0, overPlan: false, ...over }) as Wallet;
const person = (name: string): Recipient => ({ id: name, name, relationship: "", groupSize: 1, priority: 3, isSelf: false, isOptional: false, preferenceNote: "", equalValueGroup: null, allocationCents: null, createdAt: "2026-08-01T00:00:00Z" });
const input = (over: Partial<Parameters<typeof summaryRows>[0]> = {}) => ({ trip, wallet: wallet(), recipients: [], preferenceTags: [], routeTag: null, currency: "CAD", ...over });
const value = (rows: { label: string; value: string }[], label: string) => rows.find((row) => row.label === label)?.value;

test("the card cannot be handed a model reply", () => {
  // Comments stripped first: the rule is about what the code can reach, and both files explain in
  // prose why they must not reach it.
  const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  for (const path of ["components/ask-summary.tsx", "app/(app)/ask/ready.ts"]) {
    const source = code(path);
    for (const forbidden of ["ChatReply", "askedField", "recipientOps", "/api/chat", "composeTurn", "reply"]) assert.equal(source.includes(forbidden), false, `${path} references ${forbidden}`);
  }
  // The drawing imports its rows and nothing from the AI contract.
  assert.equal(code("components/ask-summary.tsx").includes("trail-brief"), false);
});

test("the hotel comes from the trip, and it has never been anywhere near the model", () => {
  const rows = summaryRows(input());
  assert.equal(value(rows, "Hotel"), "The Annex Hotel");
  const block = briefContext({ trip: { city: "Toronto", country: "Canada", currency: "CAD" }, recipients: [] } as TurnContext);
  assert.equal(block.includes("Annex"), false);
  // The type has no slot for it: adding one back is the only way to send it, and that is visible.
  assert.equal(read("app/trail-brief.ts").includes("hotel?: string"), false);
});

test("moving the reserve moves the card and not one token of the prompt", () => {
  const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({ trip: { city: "Toronto", country: "Canada", currency: "CAD" }, recipients: [], ...over });
  const small = summaryRows(input({ wallet: wallet({ reserveCents: 900 }) }));
  const large = summaryRows(input({ wallet: wallet({ reserveCents: 1500 }) }));
  assert.notDeepEqual(small, large);
  assert.equal(value(small, "Reserved for delivery"), "CAD $9");
  assert.equal(value(large, "Reserved for delivery"), "CAD $15");

  const prompt = SYSTEM_PROMPT + briefContext(ctx({ plannedUnits: 250, missingFields: [] }));
  for (const leaked of ["900", "1500", "$9", "$15"]) assert.equal(prompt.includes(leaked), false, leaked);
  assert.equal(/reserve|held back|hold-?back|delivery fee/i.test(briefContext(ctx())), false);
  // needs.missing names fields, never amounts — so telling the model what is left cannot leak one.
  const withNeeds = briefContext(ctx({ missingFields: ["budget", "hotel"] }));
  assert.equal(withNeeds.includes("reserve"), false);
  assert.equal(/\d{3,}/.test(withNeeds), false, "a figure reached the brief block through needs.missing");
});

test("a long guest list is summarised rather than truncated silently", () => {
  const rows = summaryRows(input({ recipients: ["Mom", "Ana", "Bo", "Cy", "Dee", "Eli"].map(person) }));
  assert.equal(value(rows, "Shopping for"), "Mom, Ana, Bo, Cy +2 more");
  assert.equal(value(summaryRows(input()), "Shopping for"), "Nobody yet");
});

test("the row labels are the wireframe's, with the two agreed exceptions", () => {
  assert.deepEqual(summaryRows(input()).map((row) => row.label), ["Trip", "Hotel", "Total budget", "Shopping for", "Preferences", "Reserved for delivery"]);
});
