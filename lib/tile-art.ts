/** Stand-in art for a catalogue that has no photographs.
 *
 *  The hash picks one of five *fixed* tones, it does not build a colour. Feeding the
 *  seed into a hue wheel would produce a different contrast ratio for every store name,
 *  and none of them checked. Five tones means the pictogram/tile ratios in the design
 *  system (6.09–7.20:1) hold for every row in the table.
 *
 *  FNV-1a is pure, so the server and the client compute the same tile and hydration
 *  never mismatches. When real photography exists this stays as the <img> placeholder
 *  and error fallback. */

export type TileTone = 1 | 2 | 3 | 4 | 5;
export type TileIcon = "bag" | "cup" | "leaf" | "gift" | "shop" | "map";
export type TileArt = { tone: TileTone; icon: TileIcon; angle: 0 | 1 | 2 | 3 };

const ICONS = ["bag", "cup", "leaf", "gift", "shop", "map"] as const;

export function tileArt(seed: string): TileArt {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const n = h >>> 0;
  return { tone: ((n % 5) + 1) as TileTone, icon: ICONS[(n >>> 3) % ICONS.length], angle: ((n >>> 6) % 4) as TileArt["angle"] };
}

/** Spread onto the element that carries `className="tile-art"`. */
export const tileArtProps = (seed: string) => { const art = tileArt(seed); return { "data-tone": art.tone, "data-angle": art.angle, icon: art.icon } as const; };
