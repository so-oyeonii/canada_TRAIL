/** When the summary card may appear.
 *
 *  The gate reads **client state only**. `askedField === null` is not a condition and must never
 *  become one: "the model has nothing to ask" and "the traveller has answered everything" are
 *  different facts, and a model that decides it is finished one turn early would otherwise put an
 *  empty `HERE'S WHAT I'VE GOT` card on screen with a button under it.
 *
 *  It runs in the other direction too. The same list is sent to the server as `missingFields`, and
 *  `briefContext` puts the *names* in the brief block so the model knows what is left to ask —
 *  field names, never amounts, which is what keeps the hold-back out of the prompt. */

import { PREFERENCE_TAG_LABEL, ROUTE_TAG_LABEL, type PreferenceTag, type RouteTag } from "../../trail-brief.ts";
import { mustBuyCount } from "../../../lib/budget/priority.ts";
import { priceLabel } from "../../../lib/money/format.ts";
import { dateRange } from "../view.ts";
import type { Recipient, Trip, Wallet } from "../../../lib/state/types.ts";

export type SummaryInput = { trip: Trip; wallet: Wallet; recipients: Recipient[]; preferenceTags: PreferenceTag[]; routeTag: RouteTag | null; currency: string };

export const REQUIRED = ["city", "hotel", "budget", "recipients", "preferences"] as const;
export type RequiredField = (typeof REQUIRED)[number];

/** Sorted, so two callers comparing the list never disagree over ordering. */
export function missingFields(input: SummaryInput): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!input.trip.city.trim()) missing.push("city");
  // The hotel is the delivery address for every bag. It is checked here and named here, and the
  // name itself never leaves the browser — the server is told the word "hotel", nothing more.
  if (!input.trip.hotelName.trim()) missing.push("hotel");
  if (input.wallet.totalCents <= 0) missing.push("budget");
  if (!input.recipients.length) missing.push("recipients");
  if (!input.preferenceTags.length && !input.routeTag) missing.push("preferences");
  return missing.sort();
}

export const readyToPlan = (input: SummaryInput) => missingFields(input).length === 0;
/** `2 to go` for the header pill. Not a percentage: nothing here is a fraction of anything. */
export const toGoLabel = (input: SummaryInput) => { const left = missingFields(input).length; return left === 0 ? "Ready" : `${left} to go`; };

/* ── the summary card's rows ────────────────────────────────────────────── */

export type SummaryRow = { label: string; value: string };
const NAMED = 4;

/** `HERE'S WHAT I'VE GOT`, as data.
 *
 *  **Not one value here comes from a model turn.** `SummaryInput` has no slot a `ChatReply` could
 *  be passed into, which is the guarantee rather than a promise in a comment.
 *
 *  The `Reserved for delivery` row is why that matters (FIGMA_ADOPTION §1-4): the amount is a
 *  city-by-city quote the model has never been told and must never state, so the client draws it
 *  from `wallet.reserveCents`. Change the reserve and this card changes; the prompt does not move
 *  a token, and `tests/trail-summary-card.test.ts` checks both halves of that in one case. */
export function summaryRows(input: SummaryInput): SummaryRow[] {
  const { trip, wallet, recipients, preferenceTags, routeTag, currency } = input;
  const people = recipients.map((person) => person.name).filter(Boolean);
  const shown = people.slice(0, NAMED).join(", ");
  const musts = mustBuyCount(recipients);
  const preferences = [...preferenceTags.map((tag) => PREFERENCE_TAG_LABEL[tag]).filter(Boolean), ...(routeTag ? [ROUTE_TAG_LABEL[routeTag]] : [])];
  return [
    { label: "Trip", value: [trip.city, dateRange(trip.startDate, trip.endDate)].filter(Boolean).join(" · ") },
    { label: "Hotel", value: trip.hotelName || "Not set" },
    // §2 copy exception: the wireframe's "shopping budget" is the *total*, and what is shoppable
    // is `planned − spent`. Calling the total a shopping budget overstates it twice over.
    { label: "Total budget", value: priceLabel(wallet.totalCents, currency) },
    // The row itself never moves: `tests/trail-summary-card.test.ts` pins the six labels and their
    // order to the frame. A must-buy count rides on the value or not at all, and never on its own row.
    { label: "Shopping for", value: people.length ? `${people.length > NAMED ? `${shown} +${people.length - NAMED} more` : shown}${musts > 0 ? ` · ${musts} must buy` : ""}` : "Nobody yet" },
    { label: "Preferences", value: preferences.length ? preferences.join(" · ") : "None set" },
    { label: "Reserved for delivery", value: priceLabel(wallet.reserveCents, currency) },
  ];
}
