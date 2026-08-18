/** What is worth interrupting somebody for, and in what order.
 *
 *  ── TWO SIGNALS, AND THEY ARE RANKED BY HOW MUCH GUESSING THEY DO ───────────────────
 *
 *  1. **A stop on the plan that has not been bought yet, and its shop is close.** This is
 *     the whole feature. There is no inference in it at all: the traveller chose the
 *     person, approved the plan, and the shop is the one on their own route. *"Something
 *     on your Toronto list is four minutes from here"* is a fact this app already held.
 *  2. **A catalogue row whose `products.preference_tags` meet `plans.preference_tags`.**
 *     Two closed enums intersecting — the smallest step away from certainty we are willing
 *     to take, and it took no new table to take it: "the things I like" is the `is_self`
 *     recipient (0001) plus the tag chips already on `/ask/brief` (0025).
 *
 *  ── TWO SIGNALS WE REFUSE ───────────────────────────────────────────────────────────
 *
 *  · **`recipients.preference_note`.** Turning "she likes pottery" into `handmade` is a
 *    free-text-to-enum conversion with no grounding catalogue behind it, which is the
 *    definition of the hallucination this app spends `scrubReply` preventing. It is not
 *    filtered out here — **it is not a parameter**, so nothing in this file can read it.
 *  · **`memory_constraints`.** That consent was given for a conversation. Consent to be
 *    remembered in chat is not consent to be interrupted in the street.
 *
 *  ── ORDER ───────────────────────────────────────────────────────────────────────────
 *  Plan before catalogue, then N3's tier (`must` before `planned` before `spare`), then
 *  `rankSpare` — the comparator the spare-time screen already uses, rather than a second
 *  opinion about which of two shops comes first. */

import { TIER_RANK, tierOf, type PriorityTier } from "../budget/priority.ts";
import type { Recipient, Recommendation, Stop } from "../state/types.ts";
import type { PreferenceTag } from "../../app/trail-brief.ts";
import { BUFFER_MINUTES, rankSpare, type SpareRow } from "./window.ts";
import { walkMinutes, walkMinutesBetween, type Point } from "./distance.ts";
import { ENTER_METRES, type FencedStore } from "./geofence.ts";

/** Not a claim that anybody has 43 minutes. `rankSpare` takes a window because the screen
 *  it was written for has one; a fence does not. Every candidate here is inside
 *  `ENTER_METRES`, so a window wide enough to contain the whole fence makes the band term
 *  identical across the set and leaves the shared comparator doing exactly what is wanted:
 *  shorter walk first, then id. This number never reaches a screen or a sentence. */
export const FENCE_WINDOW_MINUTES = 2 * walkMinutes(ENTER_METRES) + BUFFER_MINUTES + 25;

export type CandidateKind = "plan" | "tag";
export type NearbyCandidate = SpareRow & { kind: CandidateKind; storeId: string; storeName: string; source: Recommendation["source"]; tag: PreferenceTag | null; tier: PriorityTier };

/** The columns this file is allowed to see. Everything absent from these two types is
 *  absent on purpose — see the refusals above. */
export type MatchStop = Pick<Stop, "id" | "status" | "recipientId" | "storeId" | "storePoint" | "storeName" | "handling" | "source" | "purchase">;
export type MatchPerson = Pick<Recipient, "id" | "priority" | "isOptional">;

/** Planned, and nothing recorded against it. A voided purchase is a refund, so the stop is
 *  unbought again and worth mentioning again — the same reading `computeWallet` takes. */
export const isUnbought = (stop: MatchStop) => stop.status === "planned" && (!stop.purchase || Boolean(stop.purchase.voidedAt));

/** Every shop the fence has to measure against, deduplicated, plan first. A shop with no
 *  coordinates is dropped here rather than guessed at later. */
export function fenceTargets(stops: readonly MatchStop[], products: readonly Recommendation[]): FencedStore[] {
  const seen = new Map<string, FencedStore>();
  for (const stop of stops) if (isUnbought(stop) && stop.storeId && stop.storePoint) seen.set(stop.storeId, { id: stop.storeId, lat: stop.storePoint.lat, lng: stop.storePoint.lng });
  for (const product of products) if (product.store && product.store.lat !== null && product.store.lng !== null && !seen.has(product.store.id)) seen.set(product.store.id, { id: product.store.id, lat: product.store.lat, lng: product.store.lng });
  return [...seen.values()];
}

export type MatchInput = {
  /** The ids that just crossed into the fence. `geofence.ts` decided that; this file does
   *  not measure a second time. */
  storeIds: readonly string[];
  point: Point;
  stops: readonly MatchStop[];
  recipients: readonly MatchPerson[];
  products: readonly Recommendation[];
  /** `plans.preference_tags` (0025). Empty means signal 2 produces nothing at all, which
   *  is the honest answer for a traveller who has not said what they like. */
  tags: readonly PreferenceTag[];
};

/** Signal 1. One candidate per unbought stop whose shop is in the fence. */
function planCandidates({ storeIds, point, stops, recipients }: MatchInput): NearbyCandidate[] {
  const wanted = new Set(storeIds);
  const people = new Map(recipients.map((person) => [person.id, person]));
  return stops.flatMap((stop) => {
    const storeId = stop.storeId;
    if (!storeId || !stop.storePoint || !isUnbought(stop) || !wanted.has(storeId)) return [];
    return [{
      kind: "plan" as const, id: stop.id, storeId, storeName: stop.storeName,
      handling: stop.handling, weightGrams: null, walk: walkMinutesBetween(point, stop.storePoint), source: stop.source,
      tag: null, tier: tierOf(stop.recipientId ? people.get(stop.recipientId) ?? null : null),
    }];
  });
}

/** Signal 2. One candidate per catalogue row in the fence whose tags meet the plan's, and
 *  the tag that matched travels with it so the wording can name it without inventing one. */
function tagCandidates({ storeIds, point, products, tags }: MatchInput): NearbyCandidate[] {
  if (!tags.length) return [];
  const wanted = new Set(storeIds);
  const out: NearbyCandidate[] = [];
  for (const product of products) {
    if (!product.store || !wanted.has(product.store.id)) continue;
    // The plan's own tags are searched, not the product's, so `tag` is always a value the
    // traveller picked from the closed list and never a word the catalogue introduced.
    const hit = tags.find((tag) => product.preferenceTags.includes(tag));
    if (!hit) continue;
    out.push({
      kind: "tag", id: product.id, storeId: product.store.id, storeName: product.store.name,
      handling: product.handling, weightGrams: product.weightGrams, walk: walkMinutesBetween(point, product.store), source: product.source,
      tag: hit, tier: "planned",
    });
  }
  return out;
}

const KIND_RANK: Record<CandidateKind, number> = { plan: 0, tag: 1 };

/** `rankSpare` first, then the two terms it does not know about. `sort` is stable, so the
 *  walk order it produced survives as the tie-break inside a tier. */
export function rankCandidates(rows: readonly NearbyCandidate[]): NearbyCandidate[] {
  const byWalk = rankSpare(rows, { minutesLeft: FENCE_WINDOW_MINUTES, cutoffState: "unknown" });
  return byWalk.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || TIER_RANK[a.tier] - TIER_RANK[b.tier]);
}

/** One shop is named once, however many rows point at it: three mugs in one window is one
 *  place to walk to. The best-ranked row for a shop is the one that speaks for it. */
export function nearbyCandidates(input: MatchInput): NearbyCandidate[] {
  const ranked = rankCandidates([...planCandidates(input), ...tagCandidates(input)]);
  const byStore = new Map<string, NearbyCandidate>();
  for (const row of ranked) if (!byStore.has(row.storeId)) byStore.set(row.storeId, row);
  return [...byStore.values()];
}

/** Product rule 3, asked as a question about a set: if nothing on offer is a live row, the
 *  wording says so and the daily cap drops. */
export const everySample = (rows: readonly NearbyCandidate[]) => rows.every((row) => row.source !== "live");
