"use client";

/** The root segment boundary: everything `(app)/error.tsx` cannot reach.
 *
 *  `(app)/layout.tsx` is the important one. It reads the session and probes for a trip
 *  before `AppProvider` exists, and a segment's own `error.tsx` never catches its own
 *  layout — so a Supabase failure there lands here instead. `/login`, `/onboarding`,
 *  `/survey`, `/workflow` and `/s/[token]` have no shell at all and land here too.
 *
 *  There is no `AppProvider` above this, so nothing in it may touch app state. The
 *  redirects in `(app)/layout.tsx` are safe: Next re-throws its own router errors past
 *  user boundaries, so a `redirect("/login")` still redirects. The link is a plain `<a>`
 *  for the same reason — if the router is what broke, a full load is the way out. */

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="app-shell"><main className="app-main boot-screen" role="alert">
    <h1>Trail could not open this screen.</h1>
    <p>Your account and your trips are on Trail&rsquo;s servers, and what this phone saved is still here. This screen is the only thing that failed.</p>
    <button className="btn btn--primary btn--block" onClick={reset}>Try again</button>
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load is the point: it discards the React tree that just threw. */}
    <a className="btn btn--ghost btn--block" href="/">Go to Home</a>
    {error.digest && <p className="quiet-note">Error reference {error.digest}</p>}
  </main></div>;
}
