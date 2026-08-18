/** What a share link is allowed to show, and what it is called on screen.
 *
 *  Four switches, three of them off. The defaults are not timidity: a trip row carries the
 *  hotel, the dates and the drop-off cutoff, so the thing a link can leak is an absence
 *  timetable rather than a gift list. Every switch is the owner deciding once, per link.
 *
 *  `recipients` is deliberately **not** labelled `Gift list`, which is what the wireframe
 *  called it. The gift list is shown either way — turning this off removes the names of
 *  the people each gift is for, not the gifts. A switch named after something it does not
 *  switch is the same defect as `I've dropped off my bags ✓` (FIGMA_ADOPTION §1). */

export const SHARE_SCOPE_KEYS = ["recipients", "prices", "dates", "delivery"] as const;
export type ShareScopeKey = (typeof SHARE_SCOPE_KEYS)[number];
export type ShareScope = Record<ShareScopeKey, boolean>;

export const DEFAULT_SHARE_SCOPE: ShareScope = { recipients: true, prices: false, dates: false, delivery: false };

export const SHARE_SCOPE_LABEL: Record<ShareScopeKey, string> = { recipients: "Who each gift is for", prices: "Prices", dates: "Trip dates", delivery: "Delivery status" };
export const SHARE_SCOPE_NOTE: Record<ShareScopeKey, string> = {
  recipients: "Names as you typed them. Never how you ranked them.",
  prices: "Planned prices and the trip budget. Never what you actually spent.",
  dates: "The days you are away. Off by default — this is the one that says when you are not home.",
  delivery: "How far along a bag delivery is. Never the hotel, the arrival window or the tracking code.",
};

/** Three per trip. Not a quota — a blast radius. */
export const SHARE_LINK_LIMIT = 3;

/** A body is trusted for four booleans and nothing else; anything missing or mistyped
 *  falls back to the default rather than to `true`. */
export function parseShareScope(value: unknown): ShareScope {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return SHARE_SCOPE_KEYS.reduce((scope, key) => ({ ...scope, [key]: typeof source[key] === "boolean" ? source[key] : DEFAULT_SHARE_SCOPE[key] }), {} as ShareScope);
}

export type ShareScopeColumns = { scope_recipients: boolean; scope_prices: boolean; scope_dates: boolean; scope_delivery: boolean };
export const scopeColumns = (scope: ShareScope): ShareScopeColumns => ({ scope_recipients: scope.recipients, scope_prices: scope.prices, scope_dates: scope.dates, scope_delivery: scope.delivery });
export const scopeOf = (row: ShareScopeColumns): ShareScope => ({ recipients: row.scope_recipients, prices: row.scope_prices, dates: row.scope_dates, delivery: row.scope_delivery });

/** The row as the owner's sheet sees it. No `token_hash`, no `trip_id`, no `user_id`:
 *  the sheet needs to know a link exists, when it dies and how often it has been opened. */
export type TripShare = { id: string; label: string; scope: ShareScope; issuedAt: string; expiresAt: string; revokedAt: string | null; viewCount: number; lastViewedAt: string | null };
export type IssuedShare = TripShare & { url: string };

export const shareRow = (row: ShareScopeColumns & { id: string; label: string; issued_at: string; expires_at: string; revoked_at: string | null; view_count: number; last_viewed_at: string | null }): TripShare =>
  ({ id: row.id, label: row.label, scope: scopeOf(row), issuedAt: row.issued_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, viewCount: row.view_count, lastViewedAt: row.last_viewed_at });
