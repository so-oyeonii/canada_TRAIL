/** The tappable answers under Trail AI's question.
 *
 *  ── WHY `chips` IS NOT IN `TURN_SCHEMA` ─────────────────────────────────────────────────
 *  Letting the model return its own chips would open a second way into the conversation that
 *  `scrubReply` (`app/trail-brief.ts`) does not watch. `reply` is scanned word by word for invented
 *  business names; a `chips[]` array is structured output and is not scanned at all. And a chip is
 *  worse than a sentence: tapping "Blue Banana Market" records it as something the **traveller**
 *  said, so the next turn reads the model's own hallucination back as a legitimate input, with the
 *  traveller's apparent confirmation attached to it. `tests/trail-chips.test.ts` asserts the string
 *  "chip" appears nowhere in the schema.
 *
 *  So every label here comes from one of exactly three places, and there is no fourth:
 *    1. a closed enum imported from `app/trail-brief.ts`;
 *    2. `CHIP_LITERALS` — the frozen list in this file;
 *    3. a recipient label the server already produced with `maskLabel`, i.e. the traveller's own
 *       word for a person, which is not a name the model can invent.
 *
 *  `send` is the sentence the tap types into the box. It goes through `sendMessage` like anything
 *  typed by hand — one validation path, not two. */

import { ASKED_FIELDS, CATEGORIES, CURRENCIES, PREFERENCES, PREFERENCE_TAGS, PREFERENCE_TAG_LABEL, ROUTE_TAGS, ROUTE_TAG_LABEL, type AskedField } from "./trail-brief.ts";

export type Chip = { label: string; send: string };
export type ChipContext = { recipients?: { label: string }[]; currency?: string; areas?: string[] };

/** Frozen. A new literal here is a new promise about what the app understands, so it is added
 *  deliberately and the chip test names it if it drifts. */
export const CHIP_LITERALS = [
  "Yes", "No", "Just me", "Someone else", "Each", "For the group", "The whole trip", "Gifts only",
  "Yes, the same", "They can differ", "1", "2", "3", "5", "12", "I'll carry them", "Not sure yet",
  "Anywhere in the city", "Surprise me",
] as const;

const tag = (value: (typeof PREFERENCE_TAGS)[number], send: string): Chip => ({ label: PREFERENCE_TAG_LABEL[value], send });
const walk = (value: (typeof ROUTE_TAGS)[number], send: string): Chip => ({ label: ROUTE_TAG_LABEL[value], send });

/** Twelve keys, one per `AskedField`. Adding a thirteenth asked field breaks the chip test first,
 *  which is the point: a question the app cannot offer an answer to is a dead end. */
export const ASK_CHIPS: Record<AskedField, Chip[]> = {
  recipients: [{ label: "Just me", send: "I'm only shopping for myself." }, { label: "Someone else", send: "There's someone else I need a gift for." }],
  budget_scope: [{ label: "Gifts only", send: "That budget is for the gifts alone." }, { label: "The whole trip", send: "That budget is for the whole trip, including getting my bags to the hotel." }],
  budget_total: [{ label: "Not sure yet", send: "I haven't decided on a budget yet." }],
  allocation: [{ label: "Each", send: "That amount is for each of them." }, { label: "For the group", send: "That amount is for the group in total." }],
  category: CATEGORIES.map((value) => ({ label: value, send: `I'm looking for ${value.toLowerCase()}.` })),
  preference: PREFERENCES.map((value) => ({ label: value, send: `I'd like the gifts to feel ${value.toLowerCase()}.` })),
  equal_value: [{ label: "Yes, the same", send: "Yes, those gifts should cost about the same." }, { label: "They can differ", send: "No, those gifts can be different amounts." }],
  group_size: ["1", "2", "3", "5", "12"].map((value) => ({ label: value, send: `There are ${value} of them.` })),
  // `local_only` and `easy_pack` are still the *questions* the model asks; the answers are now
  // tags rather than booleans, so these two offer the subset of PREFERENCE_TAGS each one covers.
  local_only: [tag("local", "I'd like local makers."), tag("handmade", "I'd like handmade things."), tag("not_touristy", "Nothing touristy, please."), { label: "No", send: "It doesn't have to be local." }],
  easy_pack: [tag("easy_to_pack", "It has to survive a suitcase."), tag("edible", "Something edible is fine."), tag("keepsake", "I'd like something to keep."), { label: "No", send: "Packing isn't a problem." }],
  hotel_delivery: [{ label: "Yes", send: "Yes, send the bags to my hotel." }, { label: "I'll carry them", send: "No, I'll carry the bags myself." }],
  areas: [walk("short_walk", "Keep the stops close together."), walk("moderate_walk", "I don't mind a moderate walk between stops."), walk("any_walk", "I'll walk as far as it takes."), { label: "Anywhere in the city", send: "Anywhere in the city is fine." }],
};

/** No question, no chips. A row of suggestions under a statement is the app inventing a prompt. */
export function chipsFor(field: AskedField | null, ctx: ChipContext = {}): Chip[] {
  if (!field || !(ASKED_FIELDS as readonly string[]).includes(field)) return [];
  const base = ASK_CHIPS[field];
  // Two fields answer with things the traveller already told us. Their labels come from the brief,
  // not from this file, so there is nothing here for the model to have made up.
  if (field === "recipients" || field === "allocation") {
    const people = (ctx.recipients ?? []).map((person) => person.label).filter(Boolean).slice(0, 6).map((label) => ({ label, send: field === "recipients" ? `This one is for ${label}.` : `That amount is for ${label}.` }));
    return [...people, ...base];
  }
  if (field === "areas" && ctx.areas?.length) return [...ctx.areas.slice(0, 4).map((area) => ({ label: area, send: `Keep the stops around ${area}.` })), ...base];
  if (field === "budget_total" && ctx.currency) return [{ label: ctx.currency, send: `My budget is in ${ctx.currency}.` }, ...base];
  return base;
}

/** Exported for the guard: the complete set of labels this file is allowed to produce, before a
 *  brief's own recipient and area labels are added. */
export const CLOSED_CHIP_LABELS: readonly string[] = [...CATEGORIES, ...PREFERENCES, ...CURRENCIES, ...Object.values(PREFERENCE_TAG_LABEL), ...Object.values(ROUTE_TAG_LABEL), ...CHIP_LITERALS];
