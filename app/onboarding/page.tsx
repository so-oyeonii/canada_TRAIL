import { redirect } from "next/navigation";
import { getTraveler } from "../../lib/supabase/server";
import NewTripForm from "./new-trip-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const traveler = await getTraveler();
  if (!traveler) redirect("/login?next=/onboarding");
  return <NewTripForm email={traveler.email ?? ""} />;
}
