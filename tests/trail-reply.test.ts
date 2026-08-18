import assert from "node:assert/strict";
import test from "node:test";
import { composeTurn, replyAllowList, scrubReply, NAMING_CATALOG, NAMING_NO_CATALOG, SCRUBBED_REPLY, SYSTEM_PROMPT, buildSystemPrompt, type TurnContext } from "../app/trail-brief.ts";

// The prompt is a request. This is the enforcement. With no catalogue every business name in a
// reply is invented by definition, so the scan is the last thing standing between the model and
// a traveler walking to a shop that does not exist.

const ctx: TurnContext = { trip: { city: "Toronto", country: "Canada", areas: ["Kensington Market", "Queen West", "Distillery District"], currency: "CAD" }, recipients: [{ ref: "r1", label: "Mom", relationship: "Mom" }] };
const allow = replyAllowList(ctx);
const scrub = (reply: string) => scrubReply(reply, allow);

test("a listed neighbourhood passes untouched", () => {
  const clean = scrub("Kensington Market has a few independent ceramics studios worth a look.");
  assert.equal(clean.hits.length, 0);
  assert.equal(clean.reply.includes("Kensington Market"), true);
  assert.equal(scrub("Distillery District is a short walk from Queen West.").hits.length, 0);
});

test("an invented business name is replaced, and the rest of the sentence survives", () => {
  const hit = scrub("Try Blue Banana Market on Kensington Ave for that.");
  assert.equal(hit.errorCode, "unlisted_name");
  assert.equal(hit.reply.includes("Blue Banana"), false);
  // The verb belongs to the traveler's sentence, not to the shop. Eating it broke the reply.
  assert.equal(hit.reply.startsWith("Try "), true);
  assert.equal(hit.reply.includes("for that"), true);
});

test("a full stop ends a name; it does not join two sentences into one", () => {
  // A live call produced "…or the Distillery District. It's sitting in your draft", and the scan
  // read "Distillery District. It's" as a four-word business and mangled the whole reply.
  const clean = scrub("Look in the Distillery District. It's sitting in your draft.");
  assert.deepEqual(clean.hits, []);
  assert.equal(clean.reply.includes("It's sitting"), true);
});

test("safe words recombined into a business name are still caught", () => {
  assert.deepEqual(scrub("Head to Toronto Market for that.").hits, ["Toronto Market"]);
  assert.deepEqual(scrub("St. Lawrence is worth the detour.").hits, ["St. Lawrence"]);
});

test("a Korean shop name is caught even though it carries no capital letters", () => {
  // The capitalised-run rule is blind to Hangul. If this ever passes, the suffix list has rotted.
  const hit = scrub("블루바나나 마켓에 가보세요.");
  assert.equal(hit.errorCode, "unlisted_name");
  assert.equal(hit.reply.includes("블루바나나 마켓"), false);
});

test("a stock claim replaces the whole answer", () => {
  const hit = scrub("They have it in stock this afternoon.");
  assert.equal(hit.errorCode, "confirming_language");
  assert.equal(hit.reply, SCRUBBED_REPLY);
  assert.equal(scrub("I've added it and reserved one for you.").errorCode, "confirming_language");
});

test("naming a bucket or a delivery price replaces the whole answer", () => {
  // The model is never told what a transfer costs; if it says a number, it made the number up.
  assert.equal(scrub("The delivery fee is 15 dollars.").errorCode, "reserve_leak");
  assert.equal(scrub("I've held back some of the total for the transfer.").errorCode, "reserve_leak");
});

test("the words we told the model to say are never flagged", () => {
  assert.equal(scrub("I'd suggest a hand-thrown mug — it's sitting in your draft, approve it on Trail ▸ Gifts.").hits.length, 0);
  assert.equal(scrub("Open Trail ▸ Budget to see the split, or Ask AI again here.").hits.length, 0);
  assert.equal(scrub("Mom already has a teapot, so an Art & stationery pick might land better.").hits.length, 0);
});

test("a scrubbed reply still carries the turn's structured output", () => {
  const reply = composeTurn({ reply: "Head to Blue Banana Market.", brief_patch: { category: "Food & treats" } }, ctx);
  assert.equal(reply.brief.category, "Food & treats");
  assert.equal(reply.errorCode, "unlisted_name");
  assert.deepEqual(reply.hits, ["Blue Banana Market"]);
});

test("the naming rule is one swappable block and the rest of the prompt does not move", () => {
  assert.equal(SYSTEM_PROMPT.includes(NAMING_NO_CATALOG), true);
  assert.equal(SYSTEM_PROMPT.includes(NAMING_CATALOG), false);
  const swapped = buildSystemPrompt(NAMING_CATALOG);
  assert.equal(swapped.replace(NAMING_CATALOG, ""), SYSTEM_PROMPT.replace(NAMING_NO_CATALOG, ""));
});

test("the prompt never offers to contact a store on the traveler's behalf", () => {
  // `store_inquiries` has no recipient. Offering an enquiry would be a promise nobody can keep.
  assert.equal(/ask the store for you|send the store|we can ask|enquiry on their behalf|stock question/i.test(SYSTEM_PROMPT), false);
  assert.equal(SYSTEM_PROMPT.includes("Never offer to contact a store"), true);
});

test("the prompt no longer asks for a place and forbid one in the same breath", () => {
  assert.equal(SYSTEM_PROMPT.includes("roughly where"), false);
  assert.equal(SYSTEM_PROMPT.includes("in which neighbourhood"), true);
});

test("the prompt points at the tabs that exist", () => {
  // Renamed with the tab bar (FIGMA_ADOPTION §2). `Trail` is still named because the plan
  // lives there — it is a place inside Trips, not a tab of its own any more.
  for (const tab of ["Home", "Trips", "AI tab", "Bags", "Trail", "Gifts", "Map", "Budget", "Delivery"]) assert.equal(SYSTEM_PROMPT.includes(tab), true, tab);
  assert.equal(/brief screen|picks screen|Shop tab|Ask AI|People tab/i.test(SYSTEM_PROMPT), false);
});
