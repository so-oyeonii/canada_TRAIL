/** The words an alert is allowed to use. Templates, and only templates.
 *
 *  **There is no model on this path.** `/api/chat` is not imported here and must never be:
 *  a hallucination on a lock screen is one nobody can interrogate, cannot be scrubbed after
 *  the fact, and arrives with the authority of an operating-system notification. So the
 *  hallucination control for this feature is structural rather than editorial — every
 *  string below is written out, and every value substituted into one came off a row that
 *  is already drawn on a screen.
 *
 *  ── WHAT IS BANNED, AND WHY ─────────────────────────────────────────────────────────
 *  · **Recipient names.** A lock screen is a public screen. `Mom's gift is nearby` is a
 *    surprise ruined on a train, and it is the most identifying sentence this app could
 *    put in front of a stranger. `Something on your list` says the same thing.
 *  · **`Open now`, `In stock`, `Available`.** `store_hours` (0011) is sample data too.
 *    Product rule 3 does not stop applying because the surface got smaller.
 *  · **Amounts.** `price_is_estimate` defaults true, so a figure in a notification is a
 *    guess with no `≈` to qualify it. Money is read on a screen that can show the caveat.
 *  · **`Buy`, `Order`, `Reserve`.** Product rule 2 — the traveller buys, in the shop.
 *    The call to action is `See it`.
 *  · **Addresses and metres.** `about {n} min`, rounded up by `distance.ts`, and no more.
 *  · **`You are at …`.** The app does not read the traveller's position back to them.
 *
 *  ── `Sample` IS A SENTENCE HERE, NOT A CHIP ─────────────────────────────────────────
 *  FIGMA_ADOPTION §1-1 says the label is read from the row's own `source` column. A
 *  notification has nowhere to hang a chip, so the word moves into the title and the
 *  caveat becomes the last sentence of the body — and `alert-policy.ts` lowers the daily
 *  cap on top, because honesty is expressed as frequency as well as wording. */

import type { PreferenceTag } from "../../app/trail-brief.ts";
import type { NearbyCandidate } from "./match.ts";

/** The last sentence of any body built from rows that are not `live`. Written out here
 *  once so a test can assert on the constant rather than on a copy of it. */
export const SAMPLE_TAIL = "Sample data — stock isn't confirmed.";

/** Closed map, eight entries, one per `preference_tag`. A tag with no phrase here would be
 *  a tag the wording has to invent a word for, which is the thing this file exists to stop. */
export const TAG_PHRASE: Record<PreferenceTag, string> = {
  local: "a local pick", handmade: "a handmade pick", not_touristy: "something off the tourist trail", easy_to_pack: "something easy to pack",
  edible: "something edible", useful: "something useful", keepsake: "a keepsake", budget_friendly: "something inexpensive",
};

export type AlertCopy = { title: string; body: string; cta: string; href: string };

/** Where `See it` goes. A plan candidate is a stop on a route, so it opens the route; a
 *  catalogue candidate is a thing that fits a gap, so it opens the spare-time screen.
 *  Neither is a checkout — this app has none. */
const HREF = { plan: "/trail/plan/map", tag: "/trail/spare" } as const;

/** `about 4 min`, or nothing at all. A candidate with no walking figure had no position
 *  behind it, and `close by` is the honest substitute — never a rounded guess. */
const reach = (walk: number | null) => (walk === null ? "close by" : `about ${walk} min from here`);
const sentence = (body: string, sample: boolean) => (sample ? `${body} ${SAMPLE_TAIL}` : body);

/** One alert for the whole set. `candidates` arrives ranked and deduplicated by shop
 *  (`match.ts`), so the first row is the one that speaks. */
export function alertCopy(candidates: readonly NearbyCandidate[], city: string): AlertCopy | null {
  const [lead, ...rest] = candidates;
  if (!lead) return null;
  const sample = candidates.every((row) => row.source !== "live");
  const where = city || "this city";

  if (rest.length) {
    const count = candidates.length;
    return {
      title: sample ? "Sample finds near you" : "Finds near you",
      body: sentence(lead.kind === "plan"
        ? `${count} places are within a few minutes, starting with one on your ${where} list.`
        : `${count} places on Trail's ${sample ? "sample list" : "list"} for ${where} are within a few minutes.`, sample),
      cta: "See them", href: HREF[lead.kind],
    };
  }

  if (lead.kind === "plan") {
    return {
      title: sample ? "Sample find near you" : lead.walk === null ? "On your list, nearby" : `On your list, ${lead.walk} min away`,
      // The shop is named only when the row is live. A sample shop name is a claim about a
      // real business that our data cannot back, and it is not needed to be useful.
      body: sentence(sample ? `Something on your ${where} list is ${reach(lead.walk)}.` : `${lead.storeName}, ${reach(lead.walk)}.`, sample),
      cta: "See it", href: HREF.plan,
    };
  }

  const phrase = lead.tag ? TAG_PHRASE[lead.tag] : "something";
  return {
    title: sample ? "Sample find near you" : lead.walk === null ? "Something you like, nearby" : `Something you like, ${lead.walk} min away`,
    body: sentence(sample ? `Trail's sample list for ${where} has ${phrase} ${reach(lead.walk)}.` : `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} at ${lead.storeName}, ${reach(lead.walk)}.`, sample),
    cta: "See it", href: HREF.tag,
  };
}

/** The chip that says the radio is on. It is a button, not a label: a location feature the
 *  traveller cannot see is on is a consent they have no way to withdraw. */
export const LOCATION_CHIP = "Using your location";
export const LOCATION_CHIP_OFF = "Turn off";
/** The one sentence the settings screen is not allowed to leave out. The web cannot watch
 *  a position in the background — saying otherwise leaves somebody waiting for an alert
 *  that is never coming, which is this app's worst failure mode wearing a new hat. */
export const FOREGROUND_ONLY = "Nearby alerts only work while Trail is open on your screen. The web can't watch your location in the background — on iPhone, Trail stops running the moment you switch apps.";
