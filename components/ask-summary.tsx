"use client";

/** `HERE'S WHAT I'VE GOT` — the card that ends the conversation.
 *
 *  **Nothing on this card comes from the model.** The rows are computed by `summaryRows` in
 *  `app/(app)/ask/ready.ts` from `TrailState` alone, and this file is only the drawing. There is no
 *  reply type imported here and no fetch; `tests/trail-summary-card.test.ts` proves it by reading
 *  this source rather than its output.
 *
 *  The `Reserved for delivery` row is the reason the rule exists (`FIGMA_ADOPTION §1-4`): the
 *  wireframe shows `CAD $9 reserved`, and $9 is a city-by-city quote the model has never been told
 *  and must never state. Here it comes from `wallet.reserveCents`, a number the server computed. */

import { summaryRows, type SummaryInput } from "@/app/(app)/ask/ready";
import { IconArrow, IconEdit } from "@/components/icons";

export function AskSummary({ onEdit, onCreate, pending, ...input }: SummaryInput & { onEdit: () => void; onCreate: () => void; pending?: boolean }) {
  const rows = summaryRows(input);
  return <section className="ask-summary" aria-labelledby="ask-summary-title">
    <header><h2 className="section-label" id="ask-summary-title">HERE&rsquo;S WHAT I&rsquo;VE GOT</h2>{input.wallet.overPlan && <span className="badge badge--over">OVER PLAN</span>}{pending && <span className="badge badge--pending">Saving…</span>}</header>
    <dl className="ask-summary-rows">{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    <div className="ask-summary-actions">
      <button type="button" className="btn btn--quiet" onClick={onEdit}><IconEdit />Edit details</button>
      <button type="button" className="btn btn--primary" onClick={onCreate}>Create my Trail plan<IconArrow /></button>
    </div>
  </section>;
}
