import { quoteFee } from "../../lib/transfers/clock.ts";

/** How many bags a first delivery is quoted for before anybody has bought
 *  anything. It is the included-bag count of the price list, so the reserve
 *  covers a normal run rather than a number somebody liked. */
export const QUOTE_BAGS = 3;

/** The delivery fee has one source: `delivery_pricing`. Onboarding runs before a
 *  trip exists, so the form asks `GET /api/dropoff-points?city=…` for the same
 *  quote every transfer route uses and passes it in here; this constant is the
 *  table's own fallback row, used when the city has no counters yet or the
 *  network is gone. There is no second number anywhere — `DELIVERY_FEE = 9` in
 *  the app state and "From CAD $12" on the dashboard are both gone, and the
 *  traveler whose CAD 100 budget left them $6 short at checkout is why. */
export const DELIVERY_RESERVE = quoteFee(null, QUOTE_BAGS).feeCents / 100;

/** Splits one trip budget into the three buckets the wallet screens show.
 *
 *  The delivery fee is set aside first so a traveler cannot spend it and then
 *  find they cannot send their bags. What is left is mostly spendable, with a
 *  slice held back as flexible — moving that into planned needs an approval.
 */
export function splitBudget(total: number, reserveAmount: number = DELIVERY_RESERVE) {
  const wanted = Math.max(0, Math.round(reserveAmount));
  const safeTotal = Math.max(wanted + 10, Math.round(total));
  const reserve = Math.min(wanted, safeTotal - 10);
  const spendable = safeTotal - reserve;
  const planned = Math.max(10, Math.round((spendable * 0.87) / 10) * 10);
  const flexible = spendable - planned;
  return { total: safeTotal, planned, reserve, flexible };
}
