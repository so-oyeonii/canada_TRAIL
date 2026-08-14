import { redirect } from "next/navigation";
import { getTraveler } from "../../lib/supabase/server";
import { AppProvider } from "./app-state";
import { AppShell } from "./shell";

export const dynamic = "force-dynamic";

/** Every screen under (app) is someone's trip, so the session is checked once here
 *  rather than in each route. Anonymous visitors land on sign-in and come back. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getTraveler())) redirect("/login");
  return <AppProvider><AppShell>{children}</AppShell></AppProvider>;
}
