import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/** Magic-link landing. Supabase sends the traveler here with a one-time code,
 *  which is exchanged for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  // Only same-origin relative paths, so a crafted link cannot bounce the
  // traveler to another site carrying a fresh session.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=exchange_failed`);

  return NextResponse.redirect(`${origin}${target}`);
}
