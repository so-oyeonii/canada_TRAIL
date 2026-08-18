"use client";

/** The tap. Product rule 1 has a screen.
 *
 *  Everything above the buttons is the *proposal* — nothing on it is true yet,
 *  and the copy says so rather than showing a new balance the traveller has not
 *  agreed to. Both buttons are decisions and both are recorded: a decline leaves
 *  a plan event too, so "Trail asked and I said no" is still readable next week.
 *
 *  Since migration 0013 this really is the only way the numbers move — the plan
 *  tables refuse a write from a browser, so a 503 here means the server is
 *  missing its service key, not that the approval quietly landed. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlert, IconCheck, IconClose } from "@/components/icons";
import { useTrip } from "../../../app-state";
import { price } from "../../../view";
import type { BudgetChange, BudgetChangeKind } from "@/lib/state/types";

const kindCopy: Record<BudgetChangeKind, { title: string; body: string }> = {
  allocation_overrun: { title: "Your gift list is bigger than the shopping bucket", body: "To keep the split you chose, money would move out of your flexible budget and into what you can spend." },
  bucket_move: { title: "Moving money between your buckets", body: "The trip total stays the same. What changes is how much of it is spendable." },
  total_change: { title: "Changing your trip total", body: "This raises or lowers the whole budget for this trip, not just one bucket." },
  reserve_release: { title: "Taking money out of the delivery reserve", body: "The reserve is what pays to send your bags to the hotel. Spending it means covering the delivery another way." },
};

const proposerCopy: Record<string, string> = { ai_patch: "Trail suggested this", regex_suggestion: "Trail suggested this", user_edit: "You asked for this", system_clamp: "Trail adjusted this to fit", approval: "Approved", revert: "This undoes an earlier change" };

const BUCKETS = [
  { key: "plannedCents", label: "Planned shopping", tone: "planned" },
  { key: "deliveryReserveCents", label: "Reserved for delivery", tone: "reserve" },
  { key: "flexibleCents", label: "Flexible", tone: "flex" },
] as const;

export default function ApprovalLens() {
  const router = useRouter();
  const { pendingBudgetChange, budgetChanges, wallet, currency, decideBudgetChange } = useTrip();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState("");
  const decided = budgetChanges.filter((change) => change.status !== "proposed");

  const decide = async (decision: "approve" | "reject") => {
    if (!pendingBudgetChange) return;
    setBusy(decision); setProblem("");
    const reply = await decideBudgetChange(pendingBudgetChange.id, decision, note);
    setBusy(null);
    if (reply.ok) { setNote(""); router.push("/trail/plan/budget"); return; }
    if (reply.status === 503) { setProblem("Trail cannot record decisions right now. Nothing was changed — your budget is exactly as it was."); return; }
    if (reply.status === 409 && reply.data.error === "stale_proposal") { setProblem("Your budget moved after this was proposed, so Trail will not apply it. Ask again from the split screen."); return; }
    if (reply.status === 409) { setProblem("This was already decided on another device."); return; }
    setProblem(reply.status === 0 ? "You are offline. Nothing was decided." : "Trail could not record that decision.");
  };

  if (!pendingBudgetChange) return <>
    <div className="result-title"><p>APPROVALS</p><h1>Nothing is waiting<br />on you.</h1><span>Trail never moves money between your buckets on its own. When it wants to, it asks here first.</span></div>
    {decided.length
      ? <section className="handling-list"><header><span><small>What you decided</small><b>Every budget change, kept</b></span><em>{decided.length}</em></header><div>{decided.map((change) => <span key={change.id}><i>{change.status === "approved" ? <IconCheck /> : <IconClose />}</i><b>{change.reason}</b><small>{change.status === "approved" ? "You approved this" : "You declined this"} · {new Date(change.decidedAt ?? change.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</small></span>)}</div></section>
      : <div className="offline-note"><b>No budget change has ever been proposed on this trip.</b><span>Your buckets are exactly what you set when you created it.</span></div>}
    <button className="back-to-chat" onClick={() => router.push("/trail/plan/budget")}>Back to the budget</button>
  </>;

  const change: BudgetChange = pendingBudgetChange;
  const copy = kindCopy[change.kind];
  const after = change.after?.plan ?? null;
  const before = change.before?.plan ?? { totalCents: wallet.totalCents, plannedCents: wallet.plannedCents, deliveryReserveCents: wallet.reserveCents, flexibleCents: wallet.flexibleCents };

  return <>
    <div className="result-title"><p>NEEDS YOUR APPROVAL</p><h1>{copy.title}</h1><span>{copy.body}</span></div>

    <section className="proposal-card"><header><span><small>{proposerCopy[change.proposedBy] ?? "Proposed"}</small><b>{change.reason}</b></span><em>PROPOSED</em></header>
      {after
        ? <div className="proposal-diff">{BUCKETS.map(({ key, label, tone }) => { const from = before[key], to = after[key], delta = to - from; return <span key={key}><i className={tone} /><small>{label}</small><b>{price(from, currency)}</b><em className={delta === 0 ? undefined : delta > 0 ? "up" : "down"}>{delta === 0 ? "unchanged" : `${delta > 0 ? "+" : "−"}${price(Math.abs(delta), currency)}`}</em><strong>{price(to, currency)}</strong></span>; })}</div>
        : <p className="recipient-note">Trail could not read this proposal back. Decline it and ask again.</p>}
      {after && after.totalCents !== before.totalCents && <p className="recipient-note">Your trip total would go from {price(before.totalCents, currency)} to <b>{price(after.totalCents, currency)}</b>.</p>}
      {change.after?.allocations && <p className="recipient-note">The gift split for {change.after.allocations.length} {change.after.allocations.length === 1 ? "person" : "people"} is applied with it.</p>}
    </section>

    <div className="ownership-note">None of this has happened. Your budget is still {price(before.plannedCents, currency)} spendable until you tap approve, and declining changes nothing at all.</div>

    <label className="stacked"><small>Why</small><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rather keep the flexible budget" aria-describedby="approval-note-hint" /></label>
    <p className="field-hint" id="approval-note-hint">Optional. Kept with your decision.</p>

    {problem && <p className="form-error" role="alert"><IconAlert /> {problem}</p>}

    <button className="main-button dark" onClick={() => void decide("approve")} disabled={busy !== null || !after}><span>{busy === "approve" ? "Recording your approval…" : "Approve this change"}<small>Only this moves the money</small></span><i><IconCheck /></i></button>
    <button className="back-to-chat" onClick={() => void decide("reject")} disabled={busy !== null}><IconClose /> {busy === "reject" ? "Recording…" : "No, leave my budget alone"}</button>
  </>;
}
