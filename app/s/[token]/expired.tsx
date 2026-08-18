import Image from "next/image";

/** One screen for four different things: expired, revoked, forged, and a trip that is no
 *  longer there. Telling them apart would be telling a stranger which trip ids are real
 *  and which links somebody thought better of — "this link was revoked" confirms both.
 *
 *  `app/s/[token]/not-found.tsx` renders it, so the status code is 404 in every one of the
 *  four cases too. */
export function ShareUnavailable() {
  return <main className="share-screen share-gone">
    <div className="share-brand"><Image src="/logo-mark.png" alt="" width={28} height={28} /><b>TRAIL</b></div>
    <h1>This link is not available.</h1>
    <p>It may have run out, been switched off by the person who sent it, or never have been a Trail link at all.</p>
    <p className="share-gone-hint">Ask them for a new one — links are made to be short-lived, and they can create another in a tap.</p>
  </main>;
}
