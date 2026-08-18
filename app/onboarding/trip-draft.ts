"use client";

/** The first trip, as state and validation with no UI attached.
 *
 *  Two screens collect the same six answers now — the chip conversation and the four-step form —
 *  and they must not be able to disagree about what a valid trip is or about how it is submitted.
 *  Everything that used to live inside `new-trip-form.tsx` (the fee quote, the bucket preview, the
 *  date-order check, the one `POST /api/trips`) lives here, and both screens call it.
 *
 *  The budget is in **whole units** all the way through: the server converts, per currency. */

import { useEffect, useMemo, useState } from "react";
import { DELIVERY_RESERVE, QUOTE_BAGS, splitBudget } from "./budget";
import { MINOR_UNITS_BY_CURRENCY } from "../../lib/trips/input";
import { budgetScale, MAX_PREFERENCE_TAGS, type PreferenceTag } from "../trail-brief";

export const ONBOARDING_CURRENCIES = ["CAD", "USD", "EUR", "JPY", "KRW", "GBP"] as const;
/** The total's floor, scaled the same way the gift-budget slider is. 40 is a sane smallest trip
 *  budget in dollars and a meaningless one in yen; `budgetScale` is the single place that knows. */
export const totalFloor = (currency: string) => 40 * budgetScale(currency);
export const totalCeiling = (currency: string) => 1000 * budgetScale(currency);

export type TripDraft = { country: string; city: string; areas: string[]; startDate: string; endDate: string; hotelName: string; hotelAddress: string; companions: string; freeTime: string; currency: string; total: number; preferenceTags: PreferenceTag[] };
export type TripField = keyof TripDraft;

/** Where the preference tags wait for a plan to exist.
 *
 *  `POST /api/trips` cannot store them: the columns arrive with migration 0025 and, once they do,
 *  `plans` is still not writable by a browser. So the answer is carried across the redirect in
 *  sessionStorage and picked up as a **draft** — the same standing `localOnly`/`easyPack` have had
 *  all along. It is never presented as saved. `trail:v2:` is the namespace G2 owns; the key is
 *  read once and removed, so a second trip does not inherit the first one's answer. */
export const TAGS_HANDOFF_KEY = "trail:v2:onboarding-preference-tags";

const EMPTY: TripDraft = { country: "", city: "", areas: [], startDate: "", endDate: "", hotelName: "", hotelAddress: "", companions: "Solo trip", freeTime: "3 hours", currency: "CAD", total: 250, preferenceTags: [] };

export function useTripDraft() {
  const [value, setValue] = useState<TripDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reserve, setReserve] = useState(DELIVERY_RESERVE);
  const [quoted, setQuoted] = useState(false);

  const set = <K extends TripField>(field: K, next: TripDraft[K]) => setValue((current) => ({ ...current, [field]: next }));
  const toggleTag = (tag: PreferenceTag) => setValue((current) => ({ ...current, preferenceTags: current.preferenceTags.includes(tag) ? current.preferenceTags.filter((t) => t !== tag) : [...current.preferenceTags, tag].slice(0, MAX_PREFERENCE_TAGS) }));

  // The protected amount is the delivery fee, and the delivery fee is quoted by the server from
  // `delivery_pricing` for the city being typed — never by this screen. Without an answer it falls
  // back to the same price list's default row: wrong-by-city is possible, wrong-by-invention is not.
  const city = value.city.trim();
  useEffect(() => {
    if (!city) return;
    const stop = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/dropoff-points?city=${encodeURIComponent(city)}&bags=${QUOTE_BAGS}`, { signal: stop.signal, headers: { accept: "application/json" } });
        if (!response.ok) return;
        const data = (await response.json()) as { quote?: { feeCents?: number; currency?: string } };
        if (typeof data.quote?.feeCents === "number") { setReserve(data.quote.feeCents / MINOR_UNITS_BY_CURRENCY(data.quote.currency)); setQuoted(true); }
      } catch { /* offline: the fallback row already covers this */ }
    }, 300);
    return () => { stop.abort(); window.clearTimeout(timer); };
  }, [city]);

  const buckets = useMemo(() => splitBudget(value.total, reserve), [value.total, reserve]);
  const datesValid = !value.startDate || !value.endDate || value.endDate >= value.startDate;

  /** One answer per step, judged the same way on both screens. */
  const canAnswer = (field: TripField): boolean => {
    if (field === "city" || field === "country") return Boolean(value.country.trim() && value.city.trim());
    if (field === "startDate" || field === "endDate") return datesValid;
    if (field === "hotelName") return Boolean(value.hotelName.trim());
    if (field === "total" || field === "currency") return value.total >= totalFloor(value.currency);
    return true;
  };
  const complete = (["city", "startDate", "hotelName", "total"] as TripField[]).every(canAnswer);

  /** The body `POST /api/trips` reads. `preferenceTags` is deliberately not in it — there is no
   *  column yet, and sending a field the server drops would read as saved on this side. */
  const body = () => ({ country: value.country.trim(), city, areas: value.areas, startDate: value.startDate || null, endDate: value.endDate || null, hotelName: value.hotelName.trim(), hotelAddress: value.hotelAddress.trim(), companions: value.companions, freeTime: value.freeTime, currency: value.currency, total: value.total });

  const submit = async (): Promise<{ ok: boolean }> => {
    if (saving || !complete) return { ok: false };
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/trips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body()) });
      const data = (await response.json().catch(() => ({}))) as { error?: string; field?: string };
      if (!response.ok) { setError(response.status === 401 ? "Your session expired. Sign in again." : data.field ? `Check the ${data.field} field.` : "Could not save the trip."); setSaving(false); return { ok: false }; }
    } catch { setError("You appear to be offline. Your trip was not saved."); setSaving(false); return { ok: false }; }
    try { if (value.preferenceTags.length) sessionStorage.setItem(TAGS_HANDOFF_KEY, JSON.stringify(value.preferenceTags)); } catch { /* private mode: the tags are simply not carried over */ }
    return { ok: true };
  };

  return { value, set, toggleTag, buckets, reserve, quoted, datesValid, canAnswer, complete, body, submit, saving, error };
}
