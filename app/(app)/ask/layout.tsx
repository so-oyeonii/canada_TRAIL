import { TripGate } from "../app-state";

/** Every screen under this segment reads `trip` without a guard, so the boundary that
 *  proves there is one lives here rather than in each of them. A traveller between trips
 *  is sent to `My Trips` to choose, not back through onboarding. */
export default function AskLayout({ children }: { children: React.ReactNode }) {
  return <TripGate>{children}</TripGate>;
}
