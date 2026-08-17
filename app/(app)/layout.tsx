import { redirect } from "next/navigation";
import { createClient, getTraveler } from "../../lib/supabase/server";
import { AppProvider } from "./app-state";
import { needsOnboarding } from "./landing";
import { AppShell } from "./shell";

export const dynamic = "force-dynamic";

/** Every screen under (app) is someone's trip, so both gates are checked once
 *  here rather than in each route: no session goes to sign-in, no trip goes to
 *  onboarding. The probe is one indexed row — RLS scopes it to the caller, and a
 *  read that fails lets the traveler through to the client, which retries. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getTraveler())) redirect("/login");
  const db = await createClient();
  const trips = await db.from("trips").select("id").neq("status", "archived").limit(1);
  if (!trips.error && needsOnboarding(trips.data as { id: string }[] | null)) redirect("/onboarding");
  return <AppProvider><AppShell>{children}</AppShell></AppProvider>;
}
