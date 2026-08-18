/** "I've got about an hour and I need to be back at the hotel by six" → three chips, lit
 *  but not submitted.
 *
 *  Typing is kept because it is how people actually say this. What is not kept is the
 *  typing *deciding* anything: a reading from this file turns chips on and waits for a tap,
 *  exactly like `suggested` in `app/trail-brief.ts`. The window opens on the tap.
 *
 *  Why this is not in `inferPlanPatch`: that runs when the model is unreachable and its
 *  output goes into the brief. This runs on every keystroke's worth of text and its output
 *  goes into a form. Different trigger, different destination, different test conditions.
 *
 *  ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────────────
 *  1. **No fuzzy area matching.** An area is kept only on an exact match against the list
 *     the trip already holds. "near Queen" does not become `Queen West`: that is geocoding
 *     by eye, Trail has no geocoder, and a neighbourhood invented here would sail straight
 *     through `replyAllowList` because the allow list is built from `trip.areas`.
 *  2. **No destination that is not one of three words.** A free-text destination is how a
 *     hotel name reaches a prompt, which is the one thing `TripContext` has no field for.
 *  3. **Never rounds a window up.** `snapToChip` floors, and under the smallest chip it
 *     lights nothing.
 *  4. **A negated clause contributes nothing.** "not the hotel" leaves `endsAt` unset
 *     rather than setting it — the same rule `inferPlanPatch` follows for the same reason. */

import { snapToChip } from "../../../../lib/discovery/window.ts";
import type { SpareEnd } from "../../../trail-brief.ts";

export type SparePrefill = { minutes?: number; area?: string; endsAt?: SpareEnd };

/** English and Korean. `안 가` and `못 가` are spelled out rather than matching bare `안`,
 *  which is a syllable inside `안에` ("within") and would negate half the sentences that
 *  state a window. */
const NEGATION = /\b(not|no|without|never|avoid|except|skip)\b|말고|빼고|아니|없이|안\s*(가|갈|들르)|못\s*(가|갈|들르)/i;
/** Clause boundaries, so one negated half cannot silence the other. "An hour free, but not
 *  the hotel" keeps the hour and drops the destination. */
const CLAUSES = /[,.;·、]|\band\b|\bbut\b|\bthen\b|그리고|하지만|근데/i;

const WORD_MINUTES: [RegExp, number][] = [
  [/half an hour|반\s*시간|30\s*분/i, 30],
  [/an hour|one hour|한\s*시간|1\s*시간/i, 60],
  [/an hour and a half|hour and a half|한\s*시간\s*반/i, 90],
  [/a couple of hours|two hours|두\s*시간|2\s*시간/i, 120],
];

/** Minutes out of one clause, or null. Digits first, because "90분" is unambiguous and
 *  "an hour and a half" is a phrase the digit rule would otherwise read as 60. */
function minutesIn(clause: string): number | null {
  const hourAndHalf = /an hour and a half|hour and a half|한\s*시간\s*반|1\s*시간\s*반/i.test(clause);
  if (hourAndHalf) return 90;
  const digits = clause.match(/(\d{1,3})\s*(분|min\b|mins\b|minutes?\b)/i) ?? null;
  if (digits) return Number(digits[1]);
  const hours = clause.match(/(\d{1,2})\s*(시간|hours?\b|hrs?\b)/i) ?? null;
  if (hours) return Number(hours[1]) * 60;
  for (const [pattern, minutes] of WORD_MINUTES) if (pattern.test(clause)) return minutes;
  return null;
}

const HOTEL = /\bhotel\b|호텔|숙소/i;
const DROPOFF = /\bdrop-?off\b|\bcounter\b|\bpartner\b|드롭|카운터|맡기/i;
const ELSEWHERE = /\bstation\b|\bairport\b|\bdinner\b|\bmeeting\b|역으로|공항|저녁|약속/i;

function endsAtIn(clause: string): SpareEnd | null {
  if (HOTEL.test(clause)) return "hotel";
  if (DROPOFF.test(clause)) return "dropoff";
  if (ELSEWHERE.test(clause)) return "elsewhere";
  return null;
}

/** Exact, case-insensitive, whitespace-collapsed. Nothing else. */
function areaIn(clause: string, areas: readonly string[]): string | null {
  const flat = clause.toLowerCase().replace(/\s+/g, " ");
  return areas.find((area) => flat.includes(area.toLowerCase().replace(/\s+/g, " "))) ?? null;
}

export function readSpareText(text: string, areas: readonly string[] = []): SparePrefill {
  const prefill: SparePrefill = {};
  for (const clause of `${text}`.slice(0, 400).split(CLAUSES)) {
    if (!clause || NEGATION.test(clause)) continue;
    if (prefill.minutes === undefined) { const raw = minutesIn(clause); const chip = raw === null ? null : snapToChip(raw); if (chip !== null) prefill.minutes = chip; }
    if (prefill.endsAt === undefined) { const end = endsAtIn(clause); if (end) prefill.endsAt = end; }
    if (prefill.area === undefined) { const area = areaIn(clause, areas); if (area) prefill.area = area; }
  }
  return prefill;
}

/** Whether there is anything to offer at all. Nothing read means no suggestion card — a
 *  card that says "I understood nothing" is worse than no card. */
export const hasPrefill = (prefill: SparePrefill) => prefill.minutes !== undefined || prefill.area !== undefined || prefill.endsAt !== undefined;

/** What the tap would turn on, in the traveller's terms, so the tap is informed. */
export function describePrefill(prefill: SparePrefill, chipLabel: (minutes: number) => string): string[] {
  const parts: string[] = [];
  if (prefill.minutes !== undefined) parts.push(chipLabel(prefill.minutes));
  if (prefill.area) parts.push(prefill.area);
  if (prefill.endsAt) parts.push(prefill.endsAt === "hotel" ? "Back to my hotel" : prefill.endsAt === "dropoff" ? "A drop-off point" : "Somewhere else");
  return parts;
}
