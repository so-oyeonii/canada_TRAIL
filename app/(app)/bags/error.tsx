"use client";

/** Everything under `/bags` except the counter, which has its own.
 *
 *  What this screen refuses to say is more important than what it says: a delivery's
 *  status is a row on Trail's servers, and a boundary that fired mid-render has no idea
 *  whether the write that preceded it landed. So it sends the traveller back to read the
 *  record rather than restating it, and it never claims nothing was charged. */

import { useRouter } from "next/navigation";

export default function BagsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  return <div className="screen" role="alert">
    <h1 className="drop-head">Bags stopped drawing.</h1>
    <p className="lede">Where your delivery stands is what Trail&rsquo;s record says, not what this screen showed. Open Bags and read it there before paying or handing anything over again.</p>
    <button className="btn btn--primary btn--block" onClick={reset}>Try this screen again</button>
    <button className="btn btn--ghost btn--block" onClick={() => router.push("/bags")}>Back to Bags</button>
    <p className="quiet-note">Your bags stay physically where they are. Custody is recorded on Trail&rsquo;s servers, not on this phone.</p>
    {error.digest && <p className="quiet-note">Error reference {error.digest}</p>}
  </div>;
}
