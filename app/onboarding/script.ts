/** The onboarding conversation, as data.
 *
 *  ── WHY THIS IS NOT A MODEL ────────────────────────────────────────────────────────────
 *  The wireframe's first screen looks like a chat, and it is not one. Four of these six answers
 *  are columns of the `trips` row (`lib/trips/input.ts`), and one of them is the hotel — which
 *  under the privacy rule may never enter a model's context. Turning this into a real conversation
 *  would put the hotel name into a prompt and route around the line `tests/trail-brief.test.ts`
 *  holds on the other screen. The rest have to pass the budget range, the date order and the
 *  currency enum, and a model asked to do that gives you two copies of the validation.
 *
 *  So it is a reskin: chips and bubbles over the same `useTripDraft` the form uses, and there is
 *  no `fetch("/api/chat")` anywhere in this file tree. A guard checks that by scanning the source. */

import { priceLabel, toMinor } from "../../lib/money/format";
import { PREFERENCE_TAGS, PREFERENCE_TAG_LABEL } from "../trail-brief";
import { ONBOARDING_CURRENCIES, type TripDraft, type TripField } from "./trip-draft";

export type AnswerKind = "text" | "place" | "dates" | "money" | "chips" | "tags";
export type Step = { id: TripField; ask: string; kind: AnswerKind; chips?: readonly string[]; required: boolean; echo: (draft: TripDraft) => string };

const dateEcho = (draft: TripDraft) => (draft.startDate && draft.endDate ? `${draft.startDate} to ${draft.endDate}` : draft.startDate || "I'm not sure yet");

/** Six steps, in the wireframe's order, with the wireframe's questions. */
export const TRIP_SCRIPT: readonly Step[] = [
  { id: "city", ask: "Hello! Where are you visiting?", kind: "place", required: true, echo: (d) => [d.city, d.country].filter(Boolean).join(", ") },
  { id: "startDate", ask: "When are you there?", kind: "dates", required: false, echo: dateEcho },
  { id: "companions", ask: "Who are you shopping for?", kind: "chips", chips: ["Family", "Friends", "Coworkers", "A mix", "Just me"], required: false, echo: (d) => d.companions },
  { id: "total", ask: "What's your total budget?", kind: "money", chips: ONBOARDING_CURRENCIES, required: true, echo: (d) => priceLabel(toMinor(d.total, d.currency), d.currency) },
  // The hotel is asked for last of the four required answers and goes no further than this device
  // and the traveller's own `trips` row. It is the delivery address, not a shopping preference.
  { id: "hotelName", ask: "Where are you staying?", kind: "text", required: true, echo: (d) => d.hotelName },
  { id: "preferenceTags", ask: "Any preferences? I'll tailor my picks around these.", kind: "tags", chips: PREFERENCE_TAGS.map((tag) => PREFERENCE_TAG_LABEL[tag]), required: false, echo: (d) => (d.preferenceTags.length ? d.preferenceTags.map((tag) => PREFERENCE_TAG_LABEL[tag]).join(" · ") : "No preferences") },
];

export const CLOSING_LINE = "Perfect — I have everything I need. Ready to build your shopping plan?";
export const CREATE_CTA = "Create my Trail plan";
