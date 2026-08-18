import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { replyAllowList, scrubReply, TIMING_REPLY, TIMING_REPLY_KO, type TurnContext } from "../app/trail-brief.ts";
import { readSpareText } from "../app/(app)/trail/spare/spare-input.ts";

// A window is a filter the traveller set. It is not a schedule anybody gets to promise
// them, and least of all a model that cannot see a queue.

const ctx: TurnContext = { trip: { city: "Toronto", country: "Canada", areas: ["Queen West", "Kensington Market"], currency: "CAD" }, recipients: [{ ref: "r1", label: "Mom", relationship: "Mom" }] };
const allow = replyAllowList(ctx);
const scrub = (reply: string) => scrubReply(reply, allow);

test("the feature's own copy contains no promise", () => {
  // The screen and the arithmetic behind it. Not the input chips: `30 min` is the traveller
  // choosing a value, and a number they typed is not a number the app asserted.
  const source = ["app/(app)/trail/spare/page.tsx", "lib/discovery/window.ts"].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.equal(/\byou'?ll\b|\bmake it\b|\barrive\b|\bin time\b|\benough time\b/i.test(source), false);
});

test("every way of promising a time replaces the whole answer", () => {
  for (const line of [
    "You'll make it by 6.",
    "You have about 40 minutes.",
    "That's enough time for two shops.",
    "It takes 20 minutes each way.",
    "You'll be back in time.",
    "You'd get there and back with plenty of time.",
    "6시까지 도착하실 수 있어요.",
    "20분이면 충분해요.",
    "1시간 안에 가능합니다.",
    "제시간에 돌아오실 수 있어요.",
  ]) assert.equal(scrub(line).errorCode, "timing_promise", line);
});

test("the replacement is in the language the traveller was reading", () => {
  assert.equal(scrub("You'll make it by 6.").reply, TIMING_REPLY);
  assert.equal(scrub("20분이면 충분해요.").reply, TIMING_REPLY_KO);
  // And the replacements do not trip the guard that produced them.
  assert.equal(scrub(TIMING_REPLY).errorCode, undefined);
  assert.equal(scrub(TIMING_REPLY_KO).errorCode, undefined);
});

test("an honest sentence survives — this guard is not allowed to eat the answer", () => {
  // The reverse regression. A filter that blocks everything is a filter nobody notices is
  // broken, and the useful half of what Trail can say about an area lives in these shapes.
  for (const line of [
    "Two shops sit in this area, both a short walk apart. Whether that fits your hour is your call.",
    "Kensington Market has a few independent ceramics studios. Timing is yours to judge.",
    "이 근처에 두 곳이 있어요. 시간이 될지는 직접 판단하세요.",
    "I can't check opening hours — that has to be checked with the store in person.",
    "You'd have a short walk between the two, and the app draws the walking estimates.",
  ]) assert.equal(scrub(line).errorCode, undefined, line);
});

test("typing lights chips and never rounds the window up", () => {
  assert.deepEqual(readSpareText("I've got an hour free around Queen West, back at the hotel after", ctx.trip.areas ?? []), { minutes: 60, endsAt: "hotel", area: "Queen West" });
  assert.deepEqual(readSpareText("한 시간쯤 남았고 호텔로 갈 거예요", []), { minutes: 60, endsAt: "hotel" });
  assert.equal(readSpareText("40 minutes left", []).minutes, 30, "40 snaps down to a chip that exists, never up to 60");
  assert.equal(readSpareText("20 minutes left", []).minutes, undefined, "below the smallest chip nothing is lit at all");
});

test("a negated clause contributes nothing, and does not silence the rest", () => {
  const read = readSpareText("An hour spare, but not back to the hotel", []);
  assert.equal(read.minutes, 60);
  assert.equal(read.endsAt, undefined, "\"not the hotel\" is not \"the hotel\"");
  // With a boundary, the negation stays in its own half.
  assert.deepEqual(readSpareText("호텔은 안 가고, 90분 정도 있어요", []), { minutes: 90 });
  // Without one, the whole sentence is one clause and nothing is lit. That is the safe
  // direction: an unlit chip costs a tap, and a wrongly lit one costs a drop-off.
  assert.deepEqual(readSpareText("호텔은 안 가고 90분 정도 있어요", []), {});
});

test("a neighbourhood is matched exactly or not at all", () => {
  const areas = ["Queen West", "Kensington Market"];
  assert.equal(readSpareText("somewhere near Queen", areas).area, undefined, "there is no geocoder, so there is no near");
  assert.equal(readSpareText("I'm in queen  west right now", areas).area, "Queen West");
  assert.equal(readSpareText("I'm in Yorkville", areas).area, undefined, "an area the trip never listed is not invented here");
});
