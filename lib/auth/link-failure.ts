/** A magic link fails back to us on two paths: `?error=` from our own callback, and
 *  `#error_code=` straight from Supabase.
 *
 *  A code becomes a sentence only through this table. The `error_description` that rides
 *  along on the fragment is never spoken in our voice: the fragment never reaches the
 *  server, anyone can append one, and this is the screen that asks for credentials — so
 *  `#error_description=Your+account+is+locked.+Call+1-800-555-0100` would otherwise be
 *  phishing copy hosted on our own domain, inside our own `role="alert"` box. */
export const LINK_FAILURES: Record<string, string> = {
  missing_code: "That link arrived without a sign-in code. Mail scanners sometimes open links first — request a new one.",
  exchange_failed: "That link could not be turned into a session. Open it in the same browser you requested it from.",
  otp_expired: "That sign-in link has expired. Each link works once, within an hour.",
  access_denied: "That sign-in link is no longer valid. Request a new one below.",
  dev_no_email: "That sign-in link needs an email address.",
  dev_link_failed: "That sign-in link could not be minted.",
};
export const FALLBACK_LINK_FAILURE = "That sign-in link did not work. Request a new one below.";

export function linkFailureMessage(search: string, fragment: string) {
  const query = new URLSearchParams(search.replace(/^\?/, "")), hash = new URLSearchParams(fragment.replace(/^#/, ""));
  const code = query.get("error") ?? hash.get("error_code") ?? hash.get("error");
  return code ? LINK_FAILURES[code] ?? FALLBACK_LINK_FAILURE : "";
}
