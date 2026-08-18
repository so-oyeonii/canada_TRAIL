/** Who gets cut last. No database, no writes, no money moved.
 *
 *  A priority in this app is **not** a promise to buy anything. Product rule 2 puts
 *  every purchase in the traveller's own hands, and product rule 5 plus migration
 *  0013 mean a browser cannot pull a cent out of `flexible` to rescue anyone. What
 *  is left, and what this file computes, is the honest half: the order things get
 *  cut in, and a named suggestion when the split does not fit.
 *
 *  Three decisions live here rather than in a screen:
 *
 *  1. **Three tiers on screen, 1–5 in the column.** `recipients.priority` keeps its
 *     `check (priority between 1 and 5)` and the AI keeps its `minimum:1 maximum:5`,
 *     so a row the model wrote as 2 or 4 never disappears from a list. The UI reads
 *     bands and writes only the canonical 1 / 3 / 5.
 *  2. **A contradictory row renders as the weaker of the two.** `priority:1` with
 *     `is_optional:true` reads as `spare`. The dangerous failure in this app is
 *     over-promising: a gift that looks skippable and is not costs an argument, a
 *     gift that looks guaranteed and is not costs the gift.
 *  3. **Nothing is scaled, only dropped.** `trimToFit` removes whole allocations. A
 *     "trimmed" 68 that comes back as 47 is a number the traveller never said —
 *     which is the same refusal `lib/budget/allocations.ts` makes three times over.
 *
 *  `fitWithin` deliberately does not know what the constraint is (see `Limit`). N2
 *  (spare-time shopping) reuses it on minutes, and its four contract terms are in
 *  `docs/plans/N3-recipient-priority.md` §10 — the load-bearing one being that
 *  `no_fit` is a refusal and never a partial itinerary. */

import type { StopId } from "../state/types.ts";

export type PriorityTier = "must" | "planned" | "spare";
export type TierFields = { priority: number; isOptional: boolean };
export type RankedPerson = TierFields & { id: string; createdAt?: string };

export const TIERS: readonly PriorityTier[] = ["must", "planned", "spare"];
export const TIER_RANK: Record<PriorityTier, number> = { must: 0, planned: 1, spare: 2 };
export const TIER_LABEL: Record<PriorityTier, string> = { must: "Must buy", planned: "Planned", spare: "If there’s money left" };
/** `Planned` is the default and says nothing: a badge on every row is a badge on none. */
export const TIER_BADGE: Record<PriorityTier, string> = { must: "MUST BUY", planned: "", spare: "IF MONEY’S LEFT" };
/** Never `Protected` / `Reserved` / `Guaranteed` — the prompt bans those words for the same reason. */
export const TIER_HINT = "Trail never buys for you. This sets what it suggests cutting first.";

export const tierOf = (person: TierFields | null | undefined): PriorityTier => (!person ? "planned" : person.isOptional || person.priority >= 5 ? "spare" : person.priority <= 2 ? "must" : "planned");
/** The canonical write. Both columns go out in one PATCH; they are never edited apart. */
export const tierWrite = (tier: PriorityTier): TierFields => (tier === "must" ? { priority: 1, isOptional: false } : tier === "spare" ? { priority: 5, isOptional: true } : { priority: 3, isOptional: false });
export const isMustBuy = (person: TierFields | null | undefined) => tierOf(person) === "must";
export const mustBuyCount = (people: readonly TierFields[]) => people.filter(isMustBuy).length;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Tier, then creation order, then id. Never the caller's array position: two renders that
 *  disagreed about a list's order would silently disagree about who gets cut. */
const ORDER = (a: RankedPerson, b: RankedPerson) => TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)] || cmp(a.createdAt ?? "", b.createdAt ?? "") || cmp(a.id, b.id);
export const rankByTier = <T extends RankedPerson>(people: readonly T[]): T[] => [...people].sort(ORDER);

/* ── fitting a set of stops inside a constraint ─────────────────────────── */

/** Money today, minutes when N2 lands. The caller has already converted each stop into
 *  "how much of this constraint it uses", so this function never learns which it is. */
export type Limit = { kind: "money"; remainingCents: number } | { kind: "time"; remainingMinutes: number };
export const limitAmount = (limit: Limit) => (limit.kind === "money" ? limit.remainingCents : limit.remainingMinutes);

export type FitStop = { id: StopId; recipientId: string | null; cost: number };
export type FitResult = { fits: StopId[]; falls: StopId[]; reason: "fits" | "trimmed" | "no_fit" };

/** A stop nobody is named on cannot inherit anyone's mark, so it sits in `planned` and
 *  sorts behind every stop that belongs to a person — it is cut before them, not instead
 *  of a marked one. `"~"` is after every ISO timestamp. */
const UNASSIGNED = { id: "~", priority: 3, isOptional: false, createdAt: "~" } as const;

export function fitWithin(stops: readonly FitStop[], recipients: readonly RankedPerson[], limit: Limit): FitResult {
  const people = new Map(recipients.map((person) => [person.id, person]));
  const keyed = stops.map((stop) => ({ stop, person: (stop.recipientId && people.get(stop.recipientId)) || UNASSIGNED }));
  const ranked = [...keyed].sort((a, b) => ORDER(a.person, b.person) || cmp(a.stop.id, b.stop.id));
  const budget = limitAmount(limit);
  const mustCost = ranked.filter(({ person }) => isMustBuy(person)).reduce((sum, { stop }) => sum + stop.cost, 0);
  // §10 contract 2: refusing is the answer. Handing back "these four of your six must-buys fit"
  // is the silent trim this whole module exists to refuse.
  if (mustCost > budget) return { fits: [], falls: stops.map((stop) => stop.id), reason: "no_fit" };
  const fits: StopId[] = [], falls: StopId[] = [];
  let spent = 0;
  for (const { stop } of ranked) { if (spent + stop.cost <= budget) { spent += stop.cost; fits.push(stop.id); } else falls.push(stop.id); }
  return { fits, falls, reason: falls.length ? "trimmed" : "fits" };
}

/* ── suggesting a split that keeps the must-buys ────────────────────────── */

export type TrimEntry = { recipientId: string; amountCents: number };
export type TrimPerson = RankedPerson & { equalValueGroup?: string | null };
export type TrimResult =
  | { kind: "fits"; keep: TrimEntry[]; dropped: TrimEntry[] }
  | { kind: "trimmed"; keep: TrimEntry[]; dropped: TrimEntry[] }
  | { kind: "no_fit"; mustCents: number; limitCents: number };

/** What a `Suggest a split that keeps the must-buys` tap computes — and nothing else.
 *  It writes nothing: the screen fills its own inputs with the answer and the traveller
 *  still presses the same `Save this split` through the same 409.
 *
 *  Equal-value groups move as one unit and take the strongest tier and the earliest
 *  creation time of their members, so a group holding one must-buy is never cut. */
export function trimToFit(entries: readonly TrimEntry[], recipients: readonly TrimPerson[], limitCents: number): TrimResult {
  const people = new Map(recipients.map((person) => [person.id, person]));
  type Unit = { key: string; person: RankedPerson; cost: number; entries: TrimEntry[] };
  const units = new Map<string, Unit>();
  for (const entry of entries) {
    const person = people.get(entry.recipientId) ?? { id: entry.recipientId, priority: 3, isOptional: false, createdAt: "~" };
    const tag = people.get(entry.recipientId)?.equalValueGroup ?? null;
    const key = tag ? `tag:${tag}` : `id:${entry.recipientId}`;
    const held = units.get(key);
    if (!held) units.set(key, { key, person, cost: entry.amountCents, entries: [entry] });
    else { held.cost += entry.amountCents; held.entries.push(entry); if (ORDER(person, held.person) < 0) held.person = person; }
  }
  const ranked = [...units.values()].sort((a, b) => ORDER(a.person, b.person) || cmp(a.key, b.key));
  const mustCents = ranked.filter((unit) => isMustBuy(unit.person)).reduce((sum, unit) => sum + unit.cost, 0);
  if (mustCents > limitCents) return { kind: "no_fit", mustCents, limitCents };
  const keep: TrimEntry[] = [], dropped: TrimEntry[] = [];
  let spent = 0;
  for (const unit of ranked) { if (spent + unit.cost <= limitCents) { spent += unit.cost; keep.push(...unit.entries); } else dropped.push(...unit.entries); }
  return { kind: dropped.length ? "trimmed" : "fits", keep, dropped };
}

/* ── what is still unbought, and whether the money reaches it ───────────── */

export type GiftRow = RankedPerson & { name: string; allocationCents: number | null };
export type MustBuyGap = { people: GiftRow[]; names: string[]; unboughtCents: number; shortfallCents: number };

/** Product rule 5, written as a signature: `spendableCents` is `planned − spent` and the
 *  delivery reserve is not a parameter of this function. Adding it would make the warning
 *  disappear on the money that pays to get the bags to the hotel. */
export function mustBuyShortfall(recipients: readonly GiftRow[], boughtRecipientIds: Iterable<string | null | undefined>, spendableCents: number): MustBuyGap {
  const bought = new Set([...boughtRecipientIds].filter((id): id is string => !!id));
  const people = rankByTier(recipients.filter((person) => isMustBuy(person) && !bought.has(person.id)));
  const unboughtCents = people.reduce((sum, person) => sum + (person.allocationCents ?? 0), 0);
  return { people, names: people.map((person) => person.name), unboughtCents, shortfallCents: Math.max(0, unboughtCents - spendableCents) };
}

/** `Mom, Ana and Bo` — an Oxford-free list, because these are names in a warning sentence. */
export const nameList = (names: readonly string[], max = 3) => (names.length > max ? `${names.slice(0, max).join(", ")} +${names.length - max} more` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "");
