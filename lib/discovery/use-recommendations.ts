"use client";

/** `GET /api/recommendations` for one city, once.
 *
 *  Not in `TrailState`: the catalogue is public, identical for every traveller in the same
 *  city and has nothing to do with the trip's own rows. Putting it through `/api/state`
 *  would make the hydration read heavier for every screen so that two of them could draw a
 *  rail, and would put a five-minute-cacheable answer inside a `no-store` response.
 *
 *  `loading` is derived from which city the answer is for, rather than set at the top of
 *  the effect. Nothing in here writes state synchronously during a render pass — the only
 *  `setState` is in the fetch callbacks, which is what keeps a city change from cascading.
 *
 *  A failure is an empty feed with a reason, never a thrown screen: the trip underneath it
 *  is what the traveller came for. */

import { useEffect, useState } from "react";
import type { Recommendation } from "../state/types";

type Answer = { city: string; products: Recommendation[]; error: "offline" | "unavailable" | null };
export type Feed = { products: Recommendation[]; loading: boolean; error: "offline" | "unavailable" | null };

export function useRecommendations(city: string | null, limit = 12): Feed {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!city) return;
    let live = true;
    fetch(`/api/recommendations?city=${encodeURIComponent(city)}&limit=${limit}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) { setAnswer({ city, products: [], error: "unavailable" }); return; }
        const body = (await res.json()) as { products?: Recommendation[] };
        if (live) setAnswer({ city, products: body.products ?? [], error: null });
      })
      .catch(() => { if (live) setAnswer({ city, products: [], error: "offline" }); });
    return () => { live = false; };
  }, [city, limit]);

  const current = answer && answer.city === city ? answer : null;
  return { products: current?.products ?? [], loading: Boolean(city) && !current, error: current?.error ?? null };
}

/** The shops behind the products, deduplicated, in the order the feed put them. Derived
 *  rather than fetched again — `Nearby Stores` and the rail are two readings of one answer. */
export function storesOf(products: Recommendation[]) {
  const seen = new Map<string, NonNullable<Recommendation["store"]> & { source: Recommendation["source"]; sourceNote: string }>();
  for (const product of products) if (product.store && !seen.has(product.store.id)) seen.set(product.store.id, { ...product.store, source: product.source, sourceNote: product.sourceNote });
  return [...seen.values()];
}
