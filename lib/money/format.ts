/** One currency, one minor unit. This table is the only copy — `app/trail-brief.ts`
 *  re-exports it rather than keeping a second one.
 *
 *  Two product branches hang off this file: what a traveller reads on every screen, and
 *  the "actual price exceeds plan" failure branch. Every place that still divides by a
 *  hard 100 shows a yen traveller a hundredth of their budget and stores a hundred times
 *  what they spent — and a hundredfold `spent` makes the over-budget warning fire on
 *  someone who is well inside their plan.
 *
 *  Nothing is imported here, so `app/trail-brief.ts` can re-export without a cycle. */
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "JPY", "KRW"] as const;
export const MINOR_UNITS: Record<string, number> = { CAD: 100, USD: 100, EUR: 100, GBP: 100, JPY: 1, KRW: 1 };
const SYMBOL: Record<string, string> = { CAD: "$", USD: "$", EUR: "€", GBP: "£", JPY: "¥", KRW: "₩" };

export const minorUnits = (currency: string | null | undefined) => MINOR_UNITS[currency ?? ""] ?? 100;
export const toMinor = (units: number, currency: string) => Math.round(units * minorUnits(currency));
export const fromMinor = (cents: number, currency: string) => cents / minorUnits(currency);
export const currencySymbol = (currency: string) => SYMBOL[currency] ?? "";

/** Thousands separators by hand: a test that compares strings must not depend on which
 *  ICU data the runtime happens to ship. */
const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Minor units in, a number a traveller recognises out. Never rounds a cent away, and
 *  reads its decimal places off the currency — yen and won have none. */
export function amount(cents: number, currency: string) {
  const units = minorUnits(currency), sign = cents < 0 ? "−" : "", n = Math.abs(Math.round(cents));
  if (units === 1) return sign + group(String(n));
  const rest = n % units;
  return sign + group(String(Math.floor(n / units))) + (rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`);
}

/** The wireframe's canonical money label: `CAD $250`, `JPY ¥30,000`. */
export const priceLabel = (cents: number, currency: string) => `${currency} ${currencySymbol(currency)}${amount(cents, currency)}`;
