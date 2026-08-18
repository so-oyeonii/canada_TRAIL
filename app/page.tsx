import { redirect } from "next/navigation";

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The nine-screen state machine that used to live here is now the `(app)` route
 *  group. This is the landing rule: it resolves to the Home tab, and it is the
 *  single place the signed-out and no-trip branches get added once the screens
 *  read the server.
 *
 *  It also catches magic links that missed `/auth/callback`. Supabase ignores
 *  `emailRedirectTo` when that URL is not in the project's Redirect URLs
 *  allowlist and falls back to the Site URL, which drops the one-time code here
 *  instead. Handing it over beats discarding it and leaving the traveler on a
 *  login form that never says why. */
export default async function Landing({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const code = one(params.code);
  if (code) redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  const failure = one(params.error_code) ?? one(params.error);
  if (failure) redirect(`/login?error=${encodeURIComponent(failure)}`);
  redirect("/home");
}
