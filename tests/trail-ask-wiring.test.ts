import assert from "node:assert/strict";
import test from "node:test";
import { applyReply, chatPayload, refMap, totalChangeProposal, type AskActions, type AskApp } from "../app/(app)/ask/wiring.ts";
import { composeTurn, type KnownRecipient, type TurnContext } from "../app/trail-brief.ts";
import type { Recipient, Trip, Wallet } from "../lib/state/types.ts";

// `/ask` used to send four fields and read two. Everything the contract tests prove — five
// recipients in one turn, equal-value groups, an overrun that needs a tap — was parsed by the
// server and thrown away by the screen thirty lines later, and no test could see it because the
// wiring was inline in a component. These are the cases that stop that happening quietly again.

const person = (id: string, name: string, createdAt: string, over: Partial<Recipient> = {}): Recipient =>
  ({ id, name, relationship: "", groupSize: 1, priority: 3, isSelf: false, isOptional: false, preferenceNote: "", equalValueGroup: null, allocationCents: null, createdAt, ...over });

/** Deliberately out of creation order, and with one pair written in the same millisecond. */
const FIGMA: Recipient[] = [
  person("uuid-e", "Myself", "2026-08-01T10:04:00Z", { isSelf: true, isOptional: true, allocationCents: 4500 }),
  person("uuid-a", "Mom", "2026-08-01T10:00:00Z", { relationship: "Mom", priority: 1, allocationCents: 5800, preferenceNote: "already has a ceramic teapot" }),
  person("uuid-c", "friend B", "2026-08-01T10:02:00Z", { equalValueGroup: "friends", allocationCents: 6800 }),
  person("uuid-b", "friend A", "2026-08-01T10:02:00Z", { equalValueGroup: "friends", allocationCents: 6800 }),
  person("uuid-d", "work team", "2026-08-01T10:03:00Z", { groupSize: 12, allocationCents: 3900 }),
];

const trip = { id: "t", city: "Toronto", country: "Canada", areas: ["Kensington Market"], startDate: "2026-09-01", endDate: "2026-09-04", hotelName: "The Annex Hotel", hotelAddress: "296 Brunswick Ave", hotelVerifiedAt: null, companions: "Solo trip", freeTime: "3 hours", currency: "CAD" } as unknown as Trip;
const wallet = { totalCents: 30000, plannedCents: 25000, reserveCents: 900, flexibleCents: 4100, spentCents: 0, spendableCents: 25000, unallocatedCents: 2200, allocatedCents: 22800, overPlan: false } as Wallet;
const app = (over: Partial<AskApp> = {}): AskApp => ({ trip, wallet, recipients: FIGMA, serverPlan: { status: "draft" }, bought: [], state: { unplannedPurchases: [] }, plan: { category: "Home & design", preference: "Thoughtful and useful", hotelDelivery: true }, preferenceTags: ["local"], routeTag: null, ...over });

const spy = () => {
  const calls: { name: string; args: unknown[] }[] = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); return { ok: true, status: 200, data: {} }; };
  const actions: AskActions = {
    applyRecipientOps: async (...args) => record("applyRecipientOps")(...args),
    archiveRecipient: async (...args) => record("archiveRecipient")(...args),
    proposeBudgetChange: async (...args) => record("proposeBudgetChange")(...args),
    applyPatch: (...args) => void record("applyPatch")(...args),
    applyTags: (...args) => void record("applyTags")(...args),
    clearFields: (...args) => void record("clearFields")(...args),
    clearTags: (...args) => void record("clearTags")(...args),
    notify: (...args) => void record("notify")(...args),
  };
  return { actions, calls, of: (name: string) => calls.filter((call) => call.name === name) };
};

test("the payload carries everything the server needs to leave the one-name path", () => {
  const body = chatPayload(app(), "Two equal gifts for my friends.");
  for (const key of ["recipients", "plannedUnits", "unallocatedUnits", "planApproved", "hasPurchases", "missingFields"]) assert.ok(key in body, key);
  assert.equal(body.recipients.length, 5);
  assert.equal(body.plannedUnits, 250);
  assert.equal(body.unallocatedUnits, 22);
});

test("nothing that identifies where the traveller sleeps goes to the model", () => {
  const body = JSON.stringify(chatPayload(app(), "hi"));
  for (const leaked of ["Annex", "Brunswick", "hotelName", "hotelAddress", "email", "uuid-a"]) assert.equal(body.includes(leaked), false, leaked);
  assert.ok(body.includes('"hotelTransfer":"unverified"'));
  assert.ok(body.includes('"dayCount":4'));
});

test("refs mean the same person on the way out and on the way back", () => {
  // The whole risk in one case: the server mints r1..rN by array position over what `chatPayload`
  // sent, so any disagreement here attaches money to the wrong person.
  const sent = chatPayload(app(), "hi").recipients;
  const refs = refMap(FIGMA);
  assert.deepEqual([...refs.keys()], ["r1", "r2", "r3", "r4", "r5"]);
  assert.deepEqual(sent.map((r) => r.label), ["Mom", "friend A", "friend B", "work team", "Myself"]);
  assert.deepEqual([...refs.values()], ["uuid-a", "uuid-b", "uuid-c", "uuid-d", "uuid-e"]);
  // Same list in a different order is the same mapping: the sort is total, not input-order-dependent.
  assert.deepEqual([...refMap([...FIGMA].reverse()).entries()], [...refs.entries()]);
  const server: KnownRecipient[] = sent.map((entry, index) => ({ ...entry, ref: `r${index + 1}` }));
  assert.equal(refs.get(server.find((r) => r.label === "work team")!.ref), "uuid-d");
});

test("the whole figma turn reaches the draft in one write, and a removal does not", () => {
  const ctx: TurnContext = { trip: { city: "Toronto", country: "Canada", currency: "CAD" }, recipients: chatPayload(app(), "x").recipients.map((r, i) => ({ ...r, ref: `r${i + 1}` })), plannedUnits: 300 };
  const reply = composeTurn({
    reply: "Here's how I'd split it.",
    recipients: [
      { op: "update", ref: "r1", allocation_amount: 58 },
      { op: "update", ref: "r2", allocation_amount: 68, equal_value_group: "friends" },
      { op: "update", ref: "r3", allocation_amount: 68, equal_value_group: "friends" },
      { op: "update", ref: "r4", allocation_amount: 39, allocation_basis: "group_total" },
      { op: "update", ref: "r5", allocation_amount: 45 },
      { op: "remove", ref: "r4" },
    ],
  }, ctx);
  const { actions, of } = spy();
  return applyReply(reply, refMap(FIGMA), actions, { reserveCents: 900 }).then((turn) => {
    const sent = of("applyRecipientOps");
    assert.equal(sent.length, 1, "one round trip, not five: the allocations route replaces the whole list");
    const ops = sent[0].args[0] as { ref: string; fields: { allocationAmount?: number } }[];
    assert.equal(ops.length, 5);
    assert.equal(ops.reduce((sum, op) => sum + (op.fields.allocationAmount ?? 0), 0), 278);
    assert.deepEqual(sent[0].args[1], { r1: "uuid-a", r2: "uuid-b", r3: "uuid-c", r4: "uuid-d", r5: "uuid-e" });
    // Removal is a proposal. Nothing is archived until the traveller taps the card.
    assert.equal(of("archiveRecipient").length, 0);
    assert.equal(turn.awaiting?.recipientOps[0]?.op, "remove");
  });
});

test("a total the model read becomes a proposal, never a write", () => {
  const { actions, of } = spy();
  const reply = composeTurn({ reply: "Noted.", wallet_patch: { scope: "gifts_only", total_amount: 250, currency: null } }, { trip: { city: "Toronto", country: "Canada", currency: "CAD" }, recipients: [] });
  return applyReply(reply, new Map(), actions, { reserveCents: 900 }).then(() => {
    const proposed = of("proposeBudgetChange");
    assert.equal(proposed.length, 1);
    const body = proposed[0].args[0] as { kind: string; proposedBy: string; plan: { totalCents: number; plannedCents: number } };
    assert.equal(body.kind, "total_change");
    assert.equal(body.proposedBy, "ai_patch", "the ledger has to say the number came out of a chat turn");
    assert.equal(body.plan.plannedCents, 25000);
    // The buckets are computed on this side. The model never saw the reserve and never added up.
    assert.equal(totalChangeProposal({ scope: "gifts_only", totalCents: 25000 }, 1500).plan.totalCents, 29000);
  });
});

test("tags and clears go to whichever draft actually holds them", () => {
  const { actions, of } = spy();
  const reply = composeTurn({ reply: "Not chocolate then.", brief_patch: { preference_tags: ["local", "not_touristy"], route_tag: "moderate_walk" }, clear: ["category", "preference_tags"] }, { trip: { city: "Toronto", country: "Canada" }, recipients: [] });
  return applyReply(reply, new Map(), actions, { reserveCents: 900 }).then(() => {
    assert.deepEqual(of("applyTags")[0].args[0], { preferenceTags: ["local", "not_touristy"], routeTag: "moderate_walk" });
    assert.deepEqual(of("clearFields")[0].args[0], ["category"]);
    assert.equal(of("clearTags").length, 0, "a value set this turn wins over a clear in the same turn");
  });
});

test("a ref the client cannot resolve is dropped, not turned into somebody else's money", () => {
  const { actions, of } = spy();
  const reply = composeTurn({ reply: "ok", recipients: [{ op: "update", ref: "r1", allocation_amount: 58 }] }, { trip: { city: "Toronto", country: "Canada" }, recipients: [{ ref: "r1", label: "Mom" }] });
  return applyReply(reply, new Map(), actions, { reserveCents: 900 }).then(() => {
    assert.equal(of("applyRecipientOps").length, 0);
    assert.equal(of("notify").length, 0, "this is a client bug, not something the traveller did");
  });
});
