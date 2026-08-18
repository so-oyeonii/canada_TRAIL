import assert from "node:assert/strict";
import test from "node:test";
import { ASK_CHIPS, CHIP_LITERALS, CLOSED_CHIP_LABELS, chipsFor } from "../app/ask-chips.ts";
import { ASKED_FIELDS, TURN_SCHEMA } from "../app/trail-brief.ts";

// A chip is a sentence the traveller is about to be recorded as having said. That is why the model
// does not get to write one: `reply` is scrubbed word by word, a structured `chips[]` array is not,
// and a tapped hallucination re-enters the next turn wearing the traveller's confirmation.

test("the model cannot return chips", () => {
  assert.equal(JSON.stringify(TURN_SCHEMA).toLowerCase().includes("chip"), false, "a second, unscrubbed way into the conversation");
});

test("every chip label comes from a closed list", () => {
  const allowed = new Set<string>(CLOSED_CHIP_LABELS);
  for (const field of ASKED_FIELDS) for (const chip of ASK_CHIPS[field]) assert.ok(allowed.has(chip.label), `${field}/${chip.label}`);
});

test("every asked field can be answered by tapping", () => {
  assert.deepEqual(Object.keys(ASK_CHIPS).sort(), [...ASKED_FIELDS].sort());
  for (const field of ASKED_FIELDS) assert.ok(ASK_CHIPS[field].length > 0, field);
});

test("no question, no chips", () => {
  assert.deepEqual(chipsFor(null), []);
  assert.deepEqual(chipsFor("not_a_field" as never), []);
});

test("recipient chips are the brief's own labels, never invented ones", () => {
  const chips = chipsFor("recipients", { recipients: [{ label: "Mom" }, { label: "두 친구" }] });
  const allowed = new Set<string>(CLOSED_CHIP_LABELS);
  for (const chip of chips) assert.ok(allowed.has(chip.label) || ["Mom", "두 친구"].includes(chip.label), chip.label);
  assert.ok(chips.some((chip) => chip.label === "두 친구"), "a non-Latin label has to survive too");
});

test("area chips come from the trip, and a chip always carries a sentence", () => {
  const chips = chipsFor("areas", { areas: ["Kensington Market"] });
  assert.equal(chips[0].label, "Kensington Market");
  for (const field of ASKED_FIELDS) for (const chip of ASK_CHIPS[field]) assert.ok(chip.send.trim().length > 0, `${field}/${chip.label} has no sentence`);
});

test("the literal list is the only place a free string may be added", () => {
  // Naming them here means a new one cannot be slipped in without this line changing.
  assert.deepEqual([...CHIP_LITERALS].sort(), ["1", "2", "3", "5", "12", "Anywhere in the city", "Each", "For the group", "Gifts only", "I'll carry them", "Just me", "No", "Not sure yet", "Someone else", "Surprise me", "The whole trip", "They can differ", "Yes", "Yes, the same"].sort());
});
