/** Presentation-only helpers: rows in, strings out.
 *
 *  The prototype's stop cards carried `mark`, `color`, `closes` and `confidence`
 *  as columns of a sample catalog. Real stops have none of them, so what is
 *  decoration is derived here and what was invented data is gone — a stop no
 *  longer claims a closing time nobody asked the store about.
 *
 *  Copy for the six refusals and the four handoff failures lives here too. The
 *  server sends codes (`lib/transfers/eligibility.ts` is explicit that remedies
 *  are codes, not sentences); this is the one place they become English. */

import type { DataSource, Handling, HandoffFailureCode, IneligibleCode } from "@/lib/state/types";
import type { Remedy } from "@/lib/transfers/eligibility";

/** Minor units in, a number a traveler recognises out. Never rounds a cent away. */
export const money = (cents: number) => (Math.abs(cents) % 100 === 0 ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2));
export const price = (cents: number, currency = "CAD") => `${currency} $${money(cents)}`;

const TONES = ["peach", "blue", "yellow"] as const;
export const stopTone = (index: number) => TONES[index % TONES.length];
export const stopMark = (name: string) => (name.trim()[0] ?? "T").toUpperCase();
export const walkLabel = (minutes: number | null) => (minutes === null ? "On your route" : `+${minutes} min`);
/** Constitution 3: anything that is not live data says so, from the row's own column. */
export const sourceChip = (source: DataSource | null) => (source === "live" ? "" : source === "simulated" ? "SIMULATED" : "SAMPLE");
export const handlingLabel: Record<Handling, string> = { Standard: "Standard transfer", Heavy: "Heavy transfer", Fragile: "Fragile transfer", Chilled: "Chilled transfer" };

export const dateRange = (start: string | null, end: string | null) => {
  const day = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "");
  if (!start && !end) return "Dates not set";
  return start && end ? `${day(start)}–${day(end)}` : day(start ?? end);
};

export const clockTime = (value: string | null) => (value ? new Date(value).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : "");
export const etaLabel = (start: string | null, end: string | null) => (start && end ? `${clockTime(start)}–${clockTime(end)}` : "Quoted at the counter");

/** The six reasons a delivery cannot happen (0011). Titles are what went wrong,
 *  never what the traveler did wrong. */
export const ineligibleCopy: Record<IneligibleCode, { title: string; body: string }> = {
  no_partner_nearby: { title: "No Trail counter in this city", body: "Nothing can be sent from here yet. Your bags and purchases stay recorded." },
  cutoff_passed: { title: "Today’s drop-off has closed", body: "The counter stops taking bags for tonight’s run. Tomorrow’s run opens in the morning." },
  chilled_window_closed: { title: "A chilled bag is past its safe window", body: "Chilled items can only travel for four hours after you buy them. Carry that bag yourself." },
  hotel_refuses: { title: "Your hotel does not accept deliveries", body: "The front desk will not sign for third-party bags. Another address can receive them." },
  handling_unsupported: { title: "This counter cannot take these bags", body: "Handling or weight is outside what the partner accepts." },
  reserve_short: { title: "The fee is more than your delivery reserve", body: "Moving the difference out of your flexible budget is your call, not ours." },
};

/** What to offer when all the screen has is `bag_transfers.ineligible_code` — the
 *  row the server stamped, read back offline where the verdict with its remedies
 *  never arrived. The server's `remedies` win whenever they are present. */
export const fallbackRemedies: Record<IneligibleCode, Remedy[]> = {
  no_partner_nearby: ["try_tomorrow"],
  cutoff_passed: ["pick_other_partner", "try_tomorrow"],
  chilled_window_closed: ["drop_chilled_items"],
  hotel_refuses: ["use_other_address", "confirm_hotel"],
  handling_unsupported: ["pick_other_partner", "split_bags"],
  reserve_short: ["approve_flexible"],
};

export const remedyCopy: Record<Remedy, string> = {
  pick_other_partner: "Choose another counter",
  try_tomorrow: "Try again tomorrow",
  drop_chilled_items: "Take the chilled bags out",
  split_bags: "Send fewer bags",
  confirm_hotel: "Confirm with the hotel",
  use_other_address: "Update the hotel on this trip",
  approve_flexible: "Use my flexible budget",
  choose_partner: "Choose a drop-off counter",
};

/** The fourth failure branch: bags arrived and the hotel did not take them. */
export const handoffCopy: Record<HandoffFailureCode, { title: string; body: string }> = {
  front_desk_refused: { title: "The front desk refused your bags", body: "Your bags are still sealed and in Trail’s custody. Tell us where they should go." },
  tag_mismatch: { title: "A seal tag did not match", body: "The count was right and one tag was not on our list. Nothing was handed over until this is resolved." },
  guest_not_found: { title: "The hotel could not find your booking", body: "The name on the delivery does not match a guest at the desk." },
  front_desk_closed: { title: "The front desk was closed", body: "Nobody could sign for your bags. They stay sealed with Trail overnight." },
};

export const paymentFailureCopy: Record<string, string> = { card_declined: "Your bank declined the charge.", insufficient_funds: "There were not enough funds on the card.", expired_card: "That card has expired.", processing_error: "The payment service could not be reached." };

/** Why a queued write was refused. A dropped op is never retried behind the
 *  traveler's back, so this is the only place they hear about it. */
export const writeFailureCopy: Record<string, string> = {
  stale_planned_overwrite: "That purchase was already saved from another device. Trail kept the saved one.",
  manifest_frozen: "The bags are already with the partner, so the list cannot change.",
  purchase_voided: "One of those bags was refunded and cannot be sent.",
  transfer_closed: "That delivery is already finished.",
  not_confirmed: "Confirm the delivery before reporting a drop-off.",
  too_late_to_cancel: "The partner already has these bags, so it is too late to cancel.",
  already_collected: "The partner already collected these bags.",
  no_bags: "Select at least one bag first.",
  no_dropoff_point: "Choose a drop-off counter first.",
  ineligible: "This delivery cannot go ahead yet.",
};
