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

type Answer = { key: string; products: Recommendation[]; error: "offline" | "unavailable" | null };
export type Feed = { products: Recommendation[]; loading: boolean; error: "offline" | "unavailable" | null };
/** Narrowing, not locating. `area` is a neighbourhood the traveller tapped from a closed
 *  list and `open` is a filter on the shops' own hours — neither is a coordinate, and the
 *  route still refuses to take one (N2). */
export type FeedFilter = { area?: string | null; open?: boolean };

export function useRecommendations(city: string | null, limit = 12, filter: FeedFilter = {}): Feed {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const area = filter.area ?? "";
  const open = filter.open ? "1" : "";
  // One string identifies the answer, so a city change and an area change cannot race each
  // other into a feed that belongs to neither.
  const key = `${city ?? ""}|${area}|${open}|${limit}`;

  useEffect(() => {
    if (!city) return;
    let live = true;
    const query = `city=${encodeURIComponent(city)}&limit=${limit}${area ? `&area=${encodeURIComponent(area)}` : ""}${open ? "&open=1" : ""}`;
    fetch(`/api/recommendations?${query}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) { setAnswer({ key, products: [], error: "unavailable" }); return; }
        const body = (await res.json()) as { products?: Recommendation[] };
        if (live) setAnswer({ key, products: body.products ?? [], error: null });
      })
      .catch(() => { if (live) setAnswer({ key, products: [], error: "offline" }); });
    return () => { live = false; };
  }, [city, limit, area, open, key]);

  const current = answer && answer.key === key ? answer : null;
  return { products: current?.products ?? [], loading: Boolean(city) && !current, error: current?.error ?? null };
}

/** The shops behind the products, deduplicated, in the order the feed put them. Derived
 *  rather than fetched again — `Nearby Stores` and the rail are two readings of one answer. */
export function storesOf(products: Recommendation[]) {
  const seen = new Map<string, NonNullable<Recommendation["store"]> & { source: Recommendation["source"]; sourceNote: string }>();
  for (const product of products) if (product.store && !seen.has(product.store.id)) seen.set(product.store.id, { ...product.store, source: product.source, sourceNote: product.sourceNote });
  return [...seen.values()];
}
