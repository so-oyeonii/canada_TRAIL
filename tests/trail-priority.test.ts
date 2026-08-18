import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fitWithin, mustBuyShortfall, rankByTier, tierOf, tierWrite, TIER_LABEL, trimToFit, type TrimPerson } from "../lib/budget/priority.ts";

/** N3. A priority in this app answers one question — what gets cut last — and these cases are
 *  the difference between answering it and quietly buying something.
 *
 *  The figures are the figma set (58 / 68 / 68 / 39 / 45) on purpose: they are the numbers the
 *  prototype's slider rounded to 60 / 70 / 70 / 40 / 50, and a "helpful" trim that reaches for
 *  a round number is the same bug wearing a new hat. */

const person = (id: string, createdAt: string, over: Partial<TrimPerson> = {}): TrimPerson => ({ id, createdAt, priority: 3, isOptional: false, equalValueGroup: null, ...over });
const MOM = person("mom", "2026-08-01T10:00:00Z", { priority: 1 });
const FRIEND_A = person("a", "2026-08-01T10:01:00Z", { equalValueGroup: "friends" });
const FRIEND_B = person("b", "2026-08-01T10:02:00Z", { equalValueGroup: "friends" });
const TEAM = person("team", "2026-08-01T10:03:00Z", { priority: 4 });
const SELF = person("self", "2026-08-01T10:04:00Z", { priority: 5, isOptional: true });
const PEOPLE = [MOM, FRIEND_A, FRIEND_B, TEAM, SELF];
const SPLIT = [
  { recipientId: "mom", amountCents: 5800 },
  { recipientId: "a", amountCents: 6800 },
  { recipientId: "b", amountCents: 6800 },
  { recipientId: "team", amountCents: 3900 },
  { recipientId: "self", amountCents: 4500 },
];
const sum = (entries: { amountCents: number }[]) => entries.reduce((total, entry) => total + entry.amountCents, 0);
const ids = (entries: { recipientId: string }[]) => entries.map((entry) => entry.recipientId).sort();

test("the three tiers are read as bands, so a 2 or a 4 never falls off a screen", () => {
  assert.equal(tierOf({ priority: 1, isOptional: false }), "must");
  assert.equal(tierOf({ priority: 2, isOptional: false }), "must");
  assert.equal(tierOf({ priority: 3, isOptional: false }), "planned");
  assert.equal(tierOf({ priority: 4, isOptional: false }), "planned");
  assert.equal(tierOf({ priority: 5, isOptional: false }), "spare");
});

test("a row that contradicts itself renders as the weaker of the two", () => {
  // Over-promising is the dangerous failure: a gift that looked guaranteed and was not costs
  // the gift. The next write through `tierWrite` normalises the row.
  assert.equal(tierOf({ priority: 1, isOptional: true }), "spare");
  assert.equal(tierOf({ priority: 3, isOptional: true }), "spare");
});

test("only the canonical 1 / 3 / 5 is ever written, and both columns go together", () => {
  assert.deepEqual(tierWrite("must"), { priority: 1, isOptional: false });
  assert.deepEqual(tierWrite("planned"), { priority: 3, isOptional: false });
  assert.deepEqual(tierWrite("spare"), { priority: 5, isOptional: true });
  assert.equal(TIER_LABEL.spare.startsWith("If there"), true);
});

test("a tie is broken by creation order, never by where the caller put them in the array", () => {
  const shuffled = [SELF, TEAM, FRIEND_B, MOM, FRIEND_A];
  assert.deepEqual(rankByTier(shuffled).map((p) => p.id), ["mom", "a", "b", "team", "self"]);
  assert.deepEqual(rankByTier([...PEOPLE].reverse()).map((p) => p.id), rankByTier(PEOPLE).map((p) => p.id));
});

test("trimToFit does not move a must-buy by one cent", () => {
  const result = trimToFit(SPLIT, PEOPLE, 20000);
  assert.equal(result.kind, "trimmed");
  if (result.kind !== "trimmed") return;
  assert.deepEqual(result.keep.find((entry) => entry.recipientId === "mom"), { recipientId: "mom", amountCents: 5800 });
  assert.equal(result.dropped.some((entry) => entry.recipientId === "mom"), false);
});

test("the suggestion fits the bucket and rounds nothing to ten", () => {
  const result = trimToFit(SPLIT, PEOPLE, 25000);
  assert.equal(result.kind, "trimmed");
  if (result.kind !== "trimmed") return;
  assert.ok(sum(result.keep) <= 25000);
  assert.deepEqual(ids(result.dropped), ["self"]);
  // 58/68/68/39 stays 58/68/68/39. Nothing is scaled down to make a total land.
  for (const entry of [...result.keep, ...result.dropped]) assert.equal(SPLIT.some((row) => row.recipientId === entry.recipientId && row.amountCents === entry.amountCents), true);
});

test("must-buys that already exceed the bucket are a refusal, not a partial split", () => {
  const result = trimToFit([{ recipientId: "mom", amountCents: 30000 }, ...SPLIT.slice(1)], PEOPLE, 25000);
  assert.equal(result.kind, "no_fit");
  if (result.kind !== "no_fit") return;
  assert.equal(result.mustCents, 30000);
  assert.equal(result.limitCents, 25000);
  assert.equal("keep" in result, false, "a no_fit that carries a partial answer is the silent trim this refuses");
});

test("an equal-value pair moves together or not at all", () => {
  const tight = trimToFit(SPLIT, PEOPLE, 15000);
  assert.equal(tight.kind, "trimmed");
  if (tight.kind !== "trimmed") return;
  assert.deepEqual(ids(tight.dropped), ["a", "b"], "half of an equal-value group is the conflict the allocations route already refuses");
  assert.equal(ids(tight.keep).includes("mom"), true);
});

test("a must-buy shortfall never reaches into the delivery reserve", () => {
  const rows = [
    { id: "mom", name: "Mom", priority: 1, isOptional: false, allocationCents: 5800, createdAt: "2026-08-01T10:00:00Z" },
    { id: "bro", name: "Bro", priority: 1, isOptional: false, allocationCents: 4500, createdAt: "2026-08-01T10:01:00Z" },
    { id: "a", name: "Ana", priority: 3, isOptional: false, allocationCents: 6800, createdAt: "2026-08-01T10:02:00Z" },
  ];
  const gap = mustBuyShortfall(rows, ["mom"], 3000);
  assert.deepEqual(gap.names, ["Bro"]);
  assert.equal(gap.unboughtCents, 4500);
  assert.equal(gap.shortfallCents, 1500);
  assert.equal(mustBuyShortfall(rows, ["mom"], 9000).shortfallCents, 0);
  // Three parameters, and the third is `planned - spent`. There is no slot a reserve could
  // arrive in, which is product rule 5 written as a signature rather than as a comment.
  assert.equal(mustBuyShortfall.length, 3);
  assert.equal(readFileSync(new URL("../lib/budget/priority.ts", import.meta.url), "utf8").includes("reserveCents"), false);
});

test("fitWithin gives the same order on minutes as on money — N2's half of the contract", () => {
  const stops = [
    { id: "s-self", recipientId: "self", cost: 30 },
    { id: "s-mom", recipientId: "mom", cost: 30 },
    { id: "s-team", recipientId: "team", cost: 30 },
    { id: "s-loose", recipientId: null, cost: 30 },
  ];
  const time = fitWithin(stops, PEOPLE, { kind: "time", remainingMinutes: 60 });
  const money = fitWithin(stops, PEOPLE, { kind: "money", remainingCents: 60 });
  assert.deepEqual(time, money);
  assert.deepEqual(time.fits, ["s-mom", "s-team"]);
  assert.equal(time.reason, "trimmed");
  // A stop nobody is named on cannot outrank one that belongs to a person.
  assert.equal(time.falls.includes("s-loose"), true);
});

test("no_fit on time is a refusal too, and hands back no itinerary", () => {
  const stops = [{ id: "s-mom", recipientId: "mom", cost: 90 }, { id: "s-team", recipientId: "team", cost: 10 }];
  const verdict = fitWithin(stops, PEOPLE, { kind: "time", remainingMinutes: 60 });
  assert.equal(verdict.reason, "no_fit");
  assert.deepEqual(verdict.fits, [], "a no_fit that still suggests a route is the silent trim");
  assert.deepEqual(verdict.falls.sort(), ["s-mom", "s-team"]);
});
