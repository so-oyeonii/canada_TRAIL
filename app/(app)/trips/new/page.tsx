import { redirect } from "next/navigation";

/** `+` on `My Trips`, and the switcher's `Plan a new trip`.
 *
 *  A trip and its wallet are one request (`POST /api/trips`), and the flow that asks the
 *  six questions it needs already exists at `/onboarding` — it was never first-run-only,
 *  it was just the only way in. A second form here would be a second definition of what a
 *  valid trip is, and the two would drift. `landing.ts` already hides the tab bar on this
 *  path, so the redirect keeps that contract with no route missing underneath it. */
export default function NewTripPage() {
  redirect("/onboarding");
}
