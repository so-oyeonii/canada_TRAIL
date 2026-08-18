import { redirect } from "next/navigation";
import { getTraveler } from "../../lib/supabase/server";
import ChipChat from "./chip-chat";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const traveler = await getTraveler();
  if (!traveler) redirect("/login?next=/onboarding");
  return <ChipChat email={traveler.email ?? ""} />;
}
