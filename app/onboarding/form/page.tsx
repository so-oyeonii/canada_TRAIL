import { redirect } from "next/navigation";
import { getTraveler } from "../../../lib/supabase/server";
import NewTripForm from "../new-trip-form";

/** The same six answers as a form. `Edit details` in the chip conversation lands here, because
 *  changing one of six answers is faster than being asked all six again. Both screens submit
 *  through `useTripDraft`, so there is one validation and one `POST /api/trips`. */
export const dynamic = "force-dynamic";

export default async function OnboardingFormPage() {
  const traveler = await getTraveler();
  if (!traveler) redirect("/login?next=/onboarding/form");
  return <NewTripForm email={traveler.email ?? ""} />;
}
