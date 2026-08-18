import Link from "next/link";

/** The 404 for every route that is not `/s/[token]`, which has its own.
 *
 *  Server-rendered on purpose: a wrong URL is not a failure of the app, so it does not
 *  need the shell, the provider or a client bundle. */

export default function NotFound() {
  return <div className="app-shell"><main className="app-main boot-screen">
    <h1>That page is not part of Trail.</h1>
    <p>The link may be old, or the address may have a typo in it. Your trips and anything waiting to save are untouched.</p>
    <Link className="btn btn--primary btn--block" href="/">Go to Home</Link>
  </main></div>;
}
