/**  ⚠  SERVICE ROLE — THIS CLIENT HAS BYPASSRLS.
 *
 *  Row level security does not apply to anything read or written through here.
 *  Three rules, no exceptions:
 *    1. Never import this file from a client component or anything under a
 *       `"use client"` boundary. The key must not reach a browser bundle.
 *    2. Every query carries `.eq("user_id", traveler.id)` by hand, with the id
 *       coming from `getTraveler()` — never from a request body. The policies
 *       are not there to catch a mistake here.
 *    3. Use it only where RLS genuinely cannot express the rule: the one-time
 *       localStorage import (which writes rows the traveler is not allowed to
 *       write directly), payment capture, and partner custody writes.
 *  Everything else uses `lib/supabase/server.ts`, where RLS still holds. */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function hasAdminClient() { return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL); }

export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — admin-only routes cannot run");
  if (!cached) cached = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { "x-trail-role": "admin" } } });
  return cached;
}
