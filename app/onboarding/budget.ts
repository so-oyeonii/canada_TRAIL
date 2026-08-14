export const DELIVERY_RESERVE = 9;

/** Splits one trip budget into the three buckets the wallet screens show.
 *
 *  The delivery fee is set aside first so a traveler cannot spend it and then
 *  find they cannot send their bags. What is left is mostly spendable, with a
 *  slice held back as flexible — moving that into planned needs an approval.
 */
export function splitBudget(total: number) {
  const safeTotal = Math.max(DELIVERY_RESERVE + 10, Math.round(total));
  const reserve = Math.min(DELIVERY_RESERVE, safeTotal - 10);
  const spendable = safeTotal - reserve;
  const planned = Math.max(10, Math.round((spendable * 0.87) / 10) * 10);
  const flexible = spendable - planned;
  return { total: safeTotal, planned, reserve, flexible };
}
