"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser-side Supabase client. Uses the publishable key — every read and write
 *  is still filtered by RLS, which is what actually protects the data. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
