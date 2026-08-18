import assert from "node:assert/strict";
import test from "node:test";
import { missingFields, readyToPlan, toGoLabel, REQUIRED } from "../app/(app)/ask/ready.ts";
import { briefContext, composeTurn, SYSTEM_PROMPT, type TurnContext } from "../app/trail-brief.ts";
import { EMPTY_WALLET } from "../lib/state/types.ts";
import type { Recipient, Trip, Wallet } from "../lib/state/types.ts";

// Two different facts that used to be read as one: "the model has nothing to ask" and "the
// traveller has answered everything". Reading the first as the second is how an empty summary card
// with a live button gets on screen. The gate reads client state; the model's opinion is not input.

const trip = (over: Partial<Trip> = {}) => ({ city: "Toronto", country: "Canada", areas: [], startDate: null, endDate: null, hotelName: "", hotelAddress: "", companions: "", freeTime: "", currency: "CAD", hotelVerifiedAt: null, ...over } as unknown as Trip);
const person = (): Recipient => ({ id: "r", name: "Mom", relationship: "Mom", groupSize: 1, priority: 1, isSelf: false, isOptional: false, preferenceNote: "", equalValueGroup: null, allocationCents: null, createdAt: "2026-08-01T00:00:00Z" });
const bare = { trip: trip(), wallet: EMPTY_WALLET as Wallet, recipients: [] as Recipient[], preferenceTags: [], routeTag: null, currency: "CAD" };
const full = { ...bare, trip: trip({ hotelName: "The Annex Hotel" }), wallet: { ...EMPTY_WALLET, totalCents: 25000 } as Wallet, recipients: [person()], preferenceTags: ["local" as const] };

test("an empty trip names exactly what is left, and the card stays shut", () => {
  assert.deepEqual(missingFields(bare), ["budget", "hotel", "preferences", "recipients"]);
  assert.equal(readyToPlan(bare), false);
  assert.equal(toGoLabel(bare), "4 to go");
});

test("a model that says it is finished does not open the gate", () => {
  const turn = composeTurn({ reply: "Perfect — I have everything I need.", asked_field: null }, { trip: { city: "Toronto", country: "Canada" }, recipients: [] });
  assert.equal(turn.askedField, null);
  assert.equal(readyToPlan(bare), false, "the gate must not read a model turn at all");
});

test("a model that keeps asking after everything is answered is silenced by the server", () => {
  const ctx = (missing: string[] | undefined): TurnContext => ({ trip: { city: "Toronto", country: "Canada" }, recipients: [], missingFields: missing });
  assert.equal(composeTurn({ reply: "Anything else?", asked_field: "category" }, ctx([])).askedField, null);
  assert.equal(composeTurn({ reply: "Anything else?", asked_field: "category" }, ctx(["budget"])).askedField, "category");
  // Absent is not empty: a caller that never computed the list must not silence the question.
  assert.equal(composeTurn({ reply: "Anything else?", asked_field: "category" }, ctx(undefined)).askedField, "category");
});

test("the brief block tells the model what is left, by name only", () => {
  const block = briefContext({ trip: { city: "Toronto", country: "Canada" }, recipients: [], missingFields: ["budget", "recipients"] });
  assert.ok(block.includes('"missing":["budget","recipients"]'));
  assert.ok(block.includes('"done":false'));
  assert.ok(briefContext({ trip: { city: "Toronto", country: "Canada" }, recipients: [], missingFields: [] }).includes('"done":true'));
});

test("a filled trip opens the gate and the pill agrees", () => {
  assert.deepEqual(missingFields(full), []);
  assert.equal(readyToPlan(full), true);
  assert.equal(toGoLabel(full), "Ready");
  // Preferences count if either half is answered: walking distance is a preference too.
  assert.deepEqual(missingFields({ ...full, preferenceTags: [], routeTag: "short_walk" }), []);
});

test("the prompt is told never to ask for the four things the app owns", () => {
  assert.equal(REQUIRED.includes("city"), true);
  assert.ok(SYSTEM_PROMPT.includes("WHEN TO STOP ASKING"));
  assert.ok(SYSTEM_PROMPT.includes("When needs.missing is empty, ask nothing at all"));
});
