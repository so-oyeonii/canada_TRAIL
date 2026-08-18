import { NextResponse, type NextRequest } from "next/server";
import { devLoginAllowed } from "@/lib/env/deployment";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** The magic link, without the mailbox.
 *
 *  Every screen under `(app)` is gated on a real session, which normally means
 *  waiting for an email and clicking a link that only works if the callback URL
 *  is on the Supabase Redirect URLs allowlist. That round trip is right for a
 *  traveler and useless for looking at a screen you just changed.
 *
 *  So this mints the session the email would have: the service key generates
 *  the one-time code, and the ordinary server client redeems it, which is what
 *  writes the cookie. Nothing below that line is faked — same auth user, same
 *  RLS, same rows. The approval gates of migration 0013 are untouched.
 *
 *  Three locks, plus one deploy exclusion. All three have to be open: not a deployed
 *  build (`lib/env/deployment.ts` counts every Vercel environment as deployed), an
 *  explicit `TRAIL_DEV_LOGIN=on`, and a requested address equal to
 *  `TRAIL_DEV_LOGIN_EMAIL`. The address matters because `generateLink` falls back to
 *  `signup`: without lock three, any address would mint an account and a session for it.
 *  The fourth lock is `.vercelignore`, which keeps the file out of the bundle entirely. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const email = (searchParams.get("email") ?? process.env.TRAIL_DEV_LOGIN_EMAIL ?? "").trim();
  // One 404 for every refusal. Saying which lock held is itself information.
  if (!devLoginAllowed(email) || !hasAdminClient()) return new NextResponse("Not found", { status: 404 });
  const next = searchParams.get("next") ?? "/";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const admin = createAdminClient();
  // An account that does not exist yet is the common case on a fresh database,
  // and `magiclink` refuses to create one — so fall back to the signup code.
  let type: "email" | "signup" = "email";
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) { type = "signup"; link = await admin.auth.admin.generateLink({ type: "signup", email, password: crypto.randomUUID() }); }
  const token = link.data?.properties?.email_otp;
  if (link.error || !token) return NextResponse.redirect(`${origin}/login?error=dev_link_failed`);

  const db = await createClient();
  const { error } = await db.auth.verifyOtp({ email, token, type });
  if (error) return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  return NextResponse.redirect(`${origin}${target}`);
}
