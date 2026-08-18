"use client";

/** The two failure branches that had no screen: "this delivery cannot happen"
 *  and "the hotel did not take your bags".
 *
 *  Both render a code the server decided (`bag_transfers.ineligible_code`,
 *  `handoff_failure_code`) plus the remedies that came with it. Nothing here
 *  judges anything, and no remedy acts on its own — each one is a button the
 *  traveler presses. */

import { IconAlert } from "@/components/icons";
import type { HandoffFailureCode, IneligibleCode } from "@/lib/state/types";
import type { Remedy } from "@/lib/transfers/eligibility";
import { fallbackRemedies, handoffCopy, ineligibleCopy, remedyCopy } from "./view";

/** `labels` lets the screen that knows the numbers write the button. `remedyCopy`
 *  says "Use my flexible budget", which is a category, not an approval — the pay
 *  screen replaces it with the amount, the bucket and what is left. `blocked` is
 *  for a remedy that cannot work from here: the button stays visible and says why
 *  rather than moving money that is not there. */
export function Blocked({ code, detail, remedies, onRemedy, note, labels, blocked }: { code: IneligibleCode; detail?: string; remedies?: Remedy[]; onRemedy: (remedy: Remedy) => void; note?: string; labels?: Partial<Record<Remedy, string>>; blocked?: Remedy[] }) {
  const copy = ineligibleCopy[code];
  const offered = remedies?.length ? remedies : fallbackRemedies[code];
  return <section className="blocked-panel" role="alert"><i><IconAlert /></i>
    <b>{copy.title}</b>
    <p>{detail || copy.body}</p>
    {detail && detail !== copy.body && <small>{copy.body}</small>}
    <div className="blocked-actions">{offered.map((remedy) => <button key={remedy} disabled={blocked?.includes(remedy)} onClick={() => onRemedy(remedy)}>{labels?.[remedy] ?? remedyCopy[remedy]}</button>)}</div>
    {note && <small>{note}</small>}
  </section>;
}

export function HandoffFailed({ code, onReport, onAddress }: { code: HandoffFailureCode; onReport: () => void; onAddress: () => void }) {
  const copy = handoffCopy[code];
  return <section className="blocked-panel" role="alert"><i><IconAlert /></i>
    <b>{copy.title}</b>
    <p>{copy.body}</p>
    <div className="blocked-actions"><button onClick={onReport}>Tell Trail what happened</button><button onClick={onAddress}>Change the delivery address</button></div>
    <small>Your bags stay sealed and in Trail’s custody until this is settled. Nothing is charged again.</small>
  </section>;
}
