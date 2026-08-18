"use client";

/** The two cards the recommendation feed is made of.
 *
 *  Three rules from FIGMA_ADOPTION §1 are enforced here rather than in the screens:
 *
 *  1. **The chip is per card, read from that row's `source`.** No section ever says "this
 *     area is sample data" — the day one row turns `live` that label is a lie about a
 *     specific product, and nobody would notice.
 *  2. **The chip is explainable.** `products.source_note` becomes its title and its
 *     accessible description, so "Sample" can be interrogated instead of decorating.
 *  3. **`price_is_estimate` puts the `~` there, not copy.** The qualifier and the number
 *     come out of the same row.
 *
 *  The art is `lib/tile-art.ts`, not a photograph. We have no licensed photography, and a
 *  stock image under a real shop's name is one more claim about that shop. */

import Link from "next/link";
import { TILE_ICONS } from "./icons";
import { tileArt } from "@/lib/tile-art";
import type { DataSource, Recommendation, RecommendedStore } from "@/lib/state/types";
import { priceLabel } from "@/lib/money/format";

function Tile({ seed, className }: { seed: string; className?: string }) {
  const art = tileArt(seed);
  const Icon = TILE_ICONS[art.icon];
  return <span className={className ? `tile-art ${className}` : "tile-art"} data-tone={art.tone} data-angle={art.angle} aria-hidden="true"><Icon /></span>;
}

/** Nothing at all when the row is live. A chip that always renders stops meaning anything. */
export function SourceBadge({ source, note }: { source: DataSource; note?: string }) {
  if (source === "live") return null;
  const label = source === "simulated" ? "Simulated" : "Sample";
  return <em className={`badge badge--${source}`} title={note || undefined} aria-label={note ? `${label}. ${note}` : label}>{label}</em>;
}

/** Tapping a gift idea goes to the Gifts lens — the screen where gifts are actually
 *  planned. Not to the map: this row is a suggestion from the city's catalogue and is not
 *  a stop on anybody's route, and a link that implies otherwise is the card claiming to be
 *  something it is not. `href="#"` is never rendered here for the same reason. */
/** `note` is the one slot N2 added, and it is deliberately a finished string rather than a
 *  set of fields. The spare-time screen puts a band label and a walking figure in it
 *  (`Time to browse · 8 min walk`); everything that decided those words happened in
 *  `lib/discovery/window.ts`, where a test can read them. A card that computed its own
 *  would be a second opinion about how long something takes. */
export function ProductCard({ product, note }: { product: Recommendation; note?: string }) {
  const amount = priceLabel(product.priceCents, product.currency);
  return <li>
    <Link href="/trail/plan/gifts" aria-label={`${product.name}${product.store ? ` at ${product.store.name}` : ""}, ${product.priceIsEstimate ? "about " : ""}${amount}.${note ? ` ${note}.` : ""} Plan a gift.`}>
      <Tile seed={`${product.id}:${product.name}`} />
      <b>{product.name}</b>
      <em>{product.priceIsEstimate ? `≈ ${amount}` : amount}</em>
      {note && <small>{note}</small>}
      <SourceBadge source={product.source} note={product.sourceNote} />
    </Link>
  </li>;
}

/** `walkMinutes` is null unless the traveller granted a position on this screen. Null draws
 *  the neighbourhood — the one thing this card must never do is invent "12 min walk". */
export function StoreCard({ store, source, note, walkMinutes }: { store: RecommendedStore; source: DataSource; note?: string; walkMinutes: number | null }) {
  return <li>
    <Link href="/trail/plan/map" aria-label={`${store.name}, ${store.area || store.address}${walkMinutes === null ? "" : `, ${walkMinutes} minutes' walk`}`}>
      <Tile seed={`${store.id}:${store.name}`} />
      <b>{store.name}</b>
      <small>{walkMinutes === null ? store.area || store.address : `${walkMinutes} min walk · ${store.area || store.address}`}</small>
      <SourceBadge source={source} note={note} />
    </Link>
  </li>;
}

/** The skeleton G1 styled (`.is-loading`). It carries no numbers, because a placeholder
 *  price is a price. */
export function TileSkeleton({ count }: { count: number }) {
  return <>{Array.from({ length: count }, (_, i) => <li key={i} className="is-loading" aria-hidden="true"><span className="tile-art" /></li>)}</>;
}
