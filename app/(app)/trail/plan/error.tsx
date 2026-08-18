"use client";

/** The four plan lenses and the approval screen.
 *
 *  A budget change is a two-step the traveller owns, and this boundary is careful not to
 *  imply either step happened. It does not read `pendingBudgetChange` to say whether one
 *  is waiting — that value comes from the state module that may be what threw, and a
 *  stale "nothing pending" here would be read as an approval that went through. */

import { useRouter } from "next/navigation";

export default function PlanError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  return <div className="screen" role="alert">
    <h1 className="drop-head">The plan screen stopped drawing.</h1>
    <p className="lede">This decided nothing. A budget change moves money only when you approve it and Trail records it &mdash; open Approvals to see whether yours is still waiting.</p>
    <button className="btn btn--primary btn--block" onClick={reset}>Try this screen again</button>
    <button className="btn btn--ghost btn--block" onClick={() => router.push("/trail/plan/approval")}>Open Approvals</button>
    {error.digest && <p className="quiet-note">Error reference {error.digest}</p>}
  </div>;
}
