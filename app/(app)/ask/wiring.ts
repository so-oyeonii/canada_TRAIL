/** What `/ask` sends to Trail AI, and what it does with the answer.
 *
 *  This file exists because the wiring used to live inline in `page.tsx`, where no test could
 *  reach it — and so it quietly rotted. The page sent `{ message, plan, trip, history }` with no
 *  recipients at all, which dropped the server onto its one-name legacy path, and then read two of
 *  the eleven fields that came back. `brief`, `wallet`, `recipientOps`, `confirm` and `askedField`
 *  were parsed by the server, sanitised, scrubbed, and thrown away thirty lines later. Every
 *  multi-recipient case the contract tests prove works has never once reached a screen.
 *
 *  ── THE ORDER RULE ──────────────────────────────────────────────────────────────────────
 *  The model never sees a uuid. `app/api/chat/route.ts` mints `r1, r2 …` by **array position**
 *  over the recipients this file sends. So the mapping back from a ref to a person is the same
 *  ordering, applied twice — and if the two ever disagree, an allocation lands on the wrong
 *  person and the traveller finds out at a till. `ORDER` below is that single ordering:
 *  `createdAt` ascending, uuid ascending as the tie-break so two recipients written in the same
 *  millisecond cannot swap between renders. `chatPayload` and `refMap` both go through it, and
 *  nothing else in this file may sort a recipient list.
 *
 *  The ref map is also *sent back* to `POST /api/recipients/apply`, so the server resolves refs
 *  from an explicit `{ r1: uuid }` map rather than re-deriving creation order a third time. */

import { splitBuckets, type BriefField, type ChatReply, type Confirm, type PlanKey, type PlanPatch, type PreferenceTag, type RouteTag, type AskedField, type KnownRecipient, type RecipientOp, type TripContext, PLAN_KEYS } from "../../trail-brief.ts";
import { fromMinor } from "../../../lib/money/format.ts";
import type { Recipient, Trip, Wallet } from "../../../lib/state/types.ts";
import { missingFields, type SummaryInput } from "./ready.ts";

/** The one ordering. See THE ORDER RULE above before touching it. */
const ORDER = (a: Recipient, b: Recipient) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1);
export const orderRecipients = (recipients: Recipient[]) => [...recipients].sort(ORDER);
export const MAX_SENT_RECIPIENTS = 8;

/** `r1 → uuid`, in exactly the order the server mints refs in. */
export function refMap(recipients: Recipient[]): Map<string, string> {
  return new Map(orderRecipients(recipients).slice(0, MAX_SENT_RECIPIENTS).map((person, index) => [`r${index + 1}`, person.id]));
}

/** Everything `chatPayload` reads. Structural rather than `AppValue` so a test can build one. */
export type AskApp = {
  trip: Trip;
  wallet: Wallet;
  recipients: Recipient[];
  serverPlan: { status: string } | null;
  bought: unknown[];
  state: { unplannedPurchases: unknown[] } | null;
  plan: { category: string; preference: string; hotelDelivery: boolean };
  preferenceTags: PreferenceTag[];
  routeTag: RouteTag | null;
};

export type ChatPayload = {
  message: string;
  history: { role: "ai" | "user"; text: string }[];
  trip: TripContext;
  plan: { category: string; preference: string; hotelDelivery: boolean };
  recipients: KnownRecipient[];
  preferenceTags: PreferenceTag[];
  routeTag: RouteTag | null;
  plannedUnits: number;
  unallocatedUnits: number;
  planApproved: boolean;
  hasPurchases: boolean;
  missingFields: string[];
};

export const summaryInput = (app: AskApp): SummaryInput => ({ trip: app.trip, wallet: app.wallet, recipients: app.recipients, preferenceTags: app.preferenceTags, routeTag: app.routeTag, currency: app.trip.currency });

export const dayCount = (start: string | null, end: string | null) => {
  if (!start || !end) return undefined;
  const from = Date.parse(`${start}T00:00:00Z`), to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return undefined;
  return Math.round((to - from) / 86_400_000) + 1;
};

/** The body of one turn.
 *
 *  What is deliberately absent: the hotel name, the hotel address, the traveller's email, every
 *  bucket amount except `unallocated`, and any recipient id. `TripContext` has no `hotel` field at
 *  all, so the only way to send one would be to add it back to the type first. */
export function chatPayload(app: AskApp, message: string, history: { role: "ai" | "user"; text: string }[] = []): ChatPayload {
  const currency = app.trip.currency;
  const recipients: KnownRecipient[] = orderRecipients(app.recipients).slice(0, MAX_SENT_RECIPIENTS).map((person) => ({
    // No ref: the server mints it from this position. Sending one would create a second source.
    ref: "",
    label: person.name,
    relationship: person.relationship || undefined,
    groupSize: person.groupSize,
    priority: person.priority,
    isSelf: person.isSelf,
    isOptional: person.isOptional,
    equalValueGroup: person.equalValueGroup,
    // `Recipient.allocationCents` is already resolved to a group total (lib/state/types.ts), so the
    // basis it travels with is `group_total` — never re-divided by group size on the way out.
    allocation: person.allocationCents == null ? undefined : fromMinor(person.allocationCents, currency),
    allocationBasis: person.allocationCents == null ? undefined : ("group_total" as const),
    note: person.preferenceNote || undefined,
  }));
  return {
    message,
    history,
    trip: { city: app.trip.city, country: app.trip.country, areas: app.trip.areas, freeTime: app.trip.freeTime, companions: app.trip.companions, currency, dayCount: dayCount(app.trip.startDate, app.trip.endDate), hotelTransfer: app.trip.hotelVerifiedAt ? "verified" : "unverified" },
    plan: { category: app.plan.category, preference: app.plan.preference, hotelDelivery: app.plan.hotelDelivery },
    recipients,
    preferenceTags: app.preferenceTags,
    routeTag: app.routeTag,
    plannedUnits: fromMinor(app.wallet.plannedCents, currency),
    unallocatedUnits: fromMinor(app.wallet.unallocatedCents, currency),
    planApproved: app.serverPlan?.status === "approved",
    hasPurchases: app.bought.length > 0 || (app.state?.unplannedPurchases.length ?? 0) > 0,
    missingFields: missingFields(summaryInput(app)),
  };
}

/* ── applying the answer ─────────────────────────────────────────────────── */

export type Reply = { ok: boolean; status: number; data: Record<string, unknown> };
export type AskActions = {
  /** One round trip for the whole turn: `POST /api/recipients/apply` adds, updates and re-splits
   *  in a single transaction, merging with the allocations of people this turn never mentioned.
   *  Sending N separate writes would drop every untouched recipient's slice on the floor. */
  applyRecipientOps: (ops: RecipientOp[], refs: Record<string, string>) => Promise<Reply>;
  archiveRecipient: (id: string) => Promise<Reply>;
  proposeBudgetChange: (proposal: Record<string, unknown>) => Promise<Reply>;
  applyPatch: (patch: PlanPatch) => void;
  applyTags: (patch: { preferenceTags?: PreferenceTag[]; routeTag?: RouteTag | null }) => void;
  clearFields: (keys: PlanKey[]) => void;
  clearTags: (keys: BriefField[]) => void;
  notify: (message: string) => void;
};

export type AppliedTurn = { applied: RecipientOp[]; awaiting: Confirm | null; askedField: AskedField | null; overrun: Record<string, unknown> | null };

const TAG_FIELDS: BriefField[] = ["preferenceTags", "routeTag"];
export const hasConfirm = (confirm: Confirm | null | undefined): boolean => !!confirm && (confirm.recipientOps.length > 0 || !!confirm.wallet || !!confirm.budget);

/** The trip total the model read, split into buckets **here**. The model never sees the reserve
 *  and never computes a bucket; `splitBuckets` takes today's reserve as an argument, which is why
 *  changing the reserve cannot change a token of the prompt. Nothing is written: this is a
 *  proposal row that waits for the traveller's tap, per migration 0013. */
export function totalChangeProposal(wallet: { scope: "trip_total" | "gifts_only"; totalCents: number }, reserveCents: number) {
  const buckets = splitBuckets(wallet.totalCents, wallet.scope, reserveCents);
  return { kind: "total_change", proposedBy: "ai_patch", reason: "Trail read a new trip total from the conversation", plan: { totalCents: buckets.totalCents, plannedCents: buckets.plannedCents, deliveryReserveCents: buckets.deliveryReserveCents, flexibleCents: buckets.flexibleCents } };
}

/** One answer, applied. Everything that needs a tap comes back in `awaiting` instead. */
export async function applyReply(reply: ChatReply, refs: Map<string, string>, actions: AskActions, ctx: { reserveCents: number }): Promise<AppliedTurn> {
  // The legacy flat projection and the real brief describe the same turn; `patch` already carries
  // the category/preference/hotelDelivery half, so only the tags are applied separately.
  actions.applyPatch(reply.patch ?? {});
  const brief = reply.brief ?? {};
  if (brief.preferenceTags || brief.routeTag) actions.applyTags({ ...(brief.preferenceTags ? { preferenceTags: brief.preferenceTags } : {}), ...(brief.routeTag ? { routeTag: brief.routeTag } : {}) });

  const cleared: string[] = reply.clear ?? [];
  // `BriefField` and `PlanKey` overlap but are not the same set: the flat screen has two booleans
  // where the brief has eight tags, so each clear goes to whichever draft actually holds it.
  const flat = (PLAN_KEYS as string[]).filter((key) => cleared.includes(key)) as PlanKey[];
  if (flat.length) actions.clearFields(flat);
  const tags = TAG_FIELDS.filter((field) => cleared.includes(field));
  if (tags.length) actions.clearTags(tags);

  const ops = reply.recipientOps ?? [];
  let overrun: Record<string, unknown> | null = null;
  if (ops.length) {
    // A ref that reaches here and does not resolve is a bug in *this* file's ordering, not
    // something the traveller can act on — the server already rejected genuinely unknown refs as
    // `unknown_recipient`. So it is logged and dropped, never surfaced as their mistake.
    const unresolved = ops.filter((op) => op.op !== "add" && (!op.ref || !refs.has(op.ref)));
    if (unresolved.length) console.warn("Trail AI ref did not resolve on the client", unresolved.map((op) => op.ref));
    const sendable = ops.filter((op) => op.op === "add" || (op.ref && refs.has(op.ref)));
    if (sendable.length) {
      const answer = await actions.applyRecipientOps(sendable, Object.fromEntries(refs));
      // 409 `exceeds_planned` is not a failure. It is the approval card, with its body filled in.
      const proposal = answer.data?.proposal as Record<string, unknown> | null | undefined;
      if (proposal) overrun = proposal;
      else if (!answer.ok && answer.status !== 409) actions.notify("Trail could not save that to your draft.");
    }
  }

  // Since 0013 a browser cannot move money. A total the model read becomes a proposal and waits.
  if (reply.wallet) await actions.proposeBudgetChange(totalChangeProposal(reply.wallet, ctx.reserveCents));

  const awaiting = hasConfirm(reply.confirm) ? reply.confirm : null;
  return { applied: ops, awaiting, askedField: reply.askedField ?? null, overrun };
}
