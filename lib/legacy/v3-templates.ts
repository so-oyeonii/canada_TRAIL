/** Frozen copy of the prototype's mock catalogue.
 *
 *  `localStorage["trail-v3-state"]` keys purchases, replacements and saved stops
 *  by a position in these arrays. Nothing else on the device records which gift
 *  index 1 was. Deleting or reordering these constants makes an existing blob
 *  unreadable, so they are frozen here rather than left in a screen file that is
 *  being rewritten. Do not edit — add new catalogue data elsewhere. */

export const LEGACY_PRICE_SPLIT = [0.48, 0.31, 0.21] as const;
export const LEGACY_PRICE_FLOOR = 18;

export type LegacyTemplate = { name: string; store: string; address: string; handling: "Standard" | "Heavy" | "Fragile" | "Chilled"; reason: string };

export const legacyProductTemplates: readonly LegacyTemplate[] = [
  { name: "Ontario stoneware tea set", store: "Spacing Store", address: "401 Richmond St W", handling: "Fragile", reason: "Local maker · fits Mom’s budget" },
  { name: "Toronto linen market tote", store: "Kid Icarus", address: "205 Augusta Ave", handling: "Standard", reason: "Useful every day · folds flat" },
  { name: "Maple chocolate collection", store: "Blue Banana", address: "250 Augusta Ave", handling: "Chilled", reason: "Local favorite · ice pack ready" },
] as const;

export const legacyAlternativeTemplates: readonly LegacyTemplate[] = [
  { name: "Hand-thrown espresso pair", store: "Craft Ontario Shop", address: "1106 Queen St W", handling: "Fragile", reason: "Nearby alternative · same recipient budget" },
  { name: "Toronto risograph zip pouch", store: "Likely General", address: "389 Roncesvalles Ave", handling: "Standard", reason: "Nearby alternative · useful and packable" },
  { name: "Ontario berry chocolate box", store: "SOMA Chocolatemaker", address: "32 Tank House Lane", handling: "Chilled", reason: "Nearby alternative · ice-pack handling" },
] as const;

/** The price the traveler actually saw, derived from the budget at render time.
 *  Restored once at import and then frozen — never recomputed from a later budget. */
export function legacyPriceCents(budget: number, index: number) { return Math.max(LEGACY_PRICE_FLOOR, Math.round(budget * (LEGACY_PRICE_SPLIT[index] ?? 0))) * 100; }

/** The area the prototype printed on stop `index`, given the trip's area list. */
export function legacyArea(areas: readonly string[], city: string, index: number) { return areas[index % Math.max(1, areas.length)] ?? city; }
