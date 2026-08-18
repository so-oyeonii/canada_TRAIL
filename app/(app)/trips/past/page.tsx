import { redirect } from "next/navigation";

/** `My Trips` has a PAST section now, so this screen is one destination too many for the
 *  same list. Kept as a redirect rather than deleted: `trail:v2:tab:trips` may still hold
 *  this path in a traveller's sessionStorage, and a remembered tab that 404s is a tab that
 *  looks broken. */
export default function PastTripsPage() {
  redirect("/trips");
}
