"use client";

/** Who the trip is for, and how the shopping bucket is divided between them.
 *
 *  Three product rules are visible on this screen rather than only in the routes:
 *
 *  1. **Nothing here snaps to ten.** The amount a traveller types is the amount
 *     that is stored. 58/68/39/45 stays 58/68/39/45.
 *  2. **A group's amount means whatever the basis says it means.** Twelve people
 *     at 39 each is 468, and the screen has to ask which one was meant rather
 *     than guess and be out by a factor of twelve.
 *  3. **Going over the shopping bucket is not a write.** The server answers with
 *     a proposal, this screen shows what it would do, and only the approval
 *     screen moves any money.
 *
 *  The list is replaced as a set: someone left blank has no allocation, which is
 *  a different thing from having one of zero. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlert, IconArrow, IconCheck, IconPeople, IconPlus } from "@/components/icons";
import { useApp, type AllocationEntry } from "../../../../app-state";
import { toMinor } from "@/lib/money/format";
import { money, price } from "../../../../view";
import type { Recipient } from "@/lib/state/types";

type Row = { amount: string; basis: "per_person" | "group_total" };
type Conflict = { equalValueGroup: string; recipientIds: string[]; amounts: number[] };
type Overrun = { overCents: number; allocatedCents: number; plannedCents: number; coveredByFlexible: boolean; proposal: Record<string, unknown> };

const seedRow = (person: Recipient, currency: string): Row => ({ amount: person.allocationCents === null ? "" : money(person.allocationCents, currency), basis: "group_total" });
const toCents = (value: string, currency: string) => toMinor(Number(value), currency);
const valid = (amount: string) => amount.trim() !== "" && Number.isFinite(Number(amount)) && Number(amount) >= 0;

export default function PeopleLens() {
  const router = useRouter();
  const { recipients, wallet, currency, planId, serverPlan, pendingBudgetChange, addRecipient, archiveRecipient, saveAllocations, proposeBudgetChange, notify } = useApp();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overrun, setOverrun] = useState<Overrun | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [problem, setProblem] = useState("");

  const row = (person: Recipient): Row => rows[person.id] ?? seedRow(person, currency);
  const setRow = (id: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [id]: { ...(current[id] ?? { amount: "", basis: "group_total" as const }), ...patch } }));

  const entries: AllocationEntry[] = useMemo(() => recipients.map((person) => ({ person, entry: rows[person.id] ?? seedRow(person, currency) })).filter(({ entry }) => valid(entry.amount)).map(({ person, entry }) => ({ recipientId: person.id, amountCents: toCents(entry.amount, currency), basis: entry.basis })), [currency, recipients, rows]);
  // What the split comes to, read the way the server will read it: a per-person
  // figure is multiplied by the group before anything is compared to the bucket.
  const plannedTotal = entries.reduce((sum, entry) => { const person = recipients.find((p) => p.id === entry.recipientId); return sum + entry.amountCents * (entry.basis === "per_person" ? person?.groupSize ?? 1 : 1); }, 0);
  const over = plannedTotal - wallet.plannedCents;
  const editable = serverPlan?.status === "draft";

  const clearVerdicts = () => { setOverrun(null); setConflicts([]); setProblem(""); };

  const save = async () => {
    if (!planId) return;
    setBusy(true); clearVerdicts();
    const reply = await saveAllocations(entries, "Split by recipient");
    setBusy(false);
    if (reply.ok) { setRows({}); notify("Split saved"); return; }
    if (reply.status === 409 && reply.data.error === "exceeds_planned") { setOverrun(reply.data as unknown as Overrun); return; }
    if (reply.status === 409 && reply.data.error === "equal_value_conflict") { setConflicts((reply.data.conflicts ?? []) as Conflict[]); return; }
    if (reply.status === 409 && reply.data.error === "plan_not_editable") { setProblem("This plan is approved. Changing the split is a budget change."); return; }
    setProblem(reply.status === 0 ? "You are offline. The split was not saved." : "Trail could not save that split.");
  };

  const ask = async () => {
    if (!overrun) return;
    setBusy(true);
    const reply = await proposeBudgetChange(overrun.proposal);
    setBusy(false);
    if (reply.ok) { setOverrun(null); router.push("/trail/plan/approval"); }
    else setProblem("Trail could not raise that for approval.");
  };

  const add = async () => {
    const label = name.trim();
    if (!label) return;
    setBusy(true);
    const reply = await addRecipient({ name: label, relationship: relationship.trim(), groupSize });
    setBusy(false);
    if (!reply.ok) { setProblem(reply.status === 409 ? "You are already on this trip as “myself”." : "Trail could not add that person."); return; }
    setName(""); setRelationship(""); setGroupSize(1); setAdding(false);
  };

  const archive = async (person: Recipient) => {
    setBusy(true);
    const reply = await archiveRecipient(person.id);
    setBusy(false);
    if (reply.ok) notify(`${person.name} is off this trip’s plan`);
  };

  return <>
    <div className="result-title"><p>WHO THIS TRIP IS FOR</p><h1>Divide the<br /><em>shopping budget.</em></h1><span>Only the planned bucket can be divided. The delivery reserve is held back for your bags, and the flexible bucket needs your approval before anything touches it.</span></div>

    {pendingBudgetChange && <div className="budget-warning" role="status"><b>A budget change is waiting for you</b><span>{pendingBudgetChange.reason}</span><button onClick={() => router.push("/trail/plan/approval")}>Review it <span aria-hidden="true">→</span></button></div>}

    <section className="split-meter"><div><span><small>ALLOCATED</small><b>{price(plannedTotal, currency)}</b></span><em>of {price(wallet.plannedCents, currency)} planned</em></div><div className="range-values"><span>{recipients.length} {recipients.length === 1 ? "person" : "people"}</span><span className={over > 0 ? "over" : undefined}>{over > 0 ? `${price(over, currency)} over` : `${price(-over, currency)} left to divide`}</span></div></section>

    {!recipients.length && <div className="offline-note"><b>Nobody is on this trip yet.</b><span>Add the people you are shopping for, or tell Trail about them in a chat and apply what it suggests.</span></div>}

    <div className="recipient-list">{recipients.map((person) => <article key={person.id}>
      <div className="recipient-head"><i><IconPeople /></i><span><b>{person.name}{person.isSelf ? " (you)" : ""}</b><small>{[person.relationship, person.groupSize > 1 ? `group of ${person.groupSize}` : "", person.equalValueGroup ? `equal value: ${person.equalValueGroup}` : ""].filter(Boolean).join(" · ") || "No details yet"}</small></span><button type="button" onClick={() => void archive(person)} disabled={busy} aria-label={`Remove ${person.name} from this trip`}>Remove</button></div>
      {person.preferenceNote && <p className="recipient-note">{person.preferenceNote}</p>}
      <div className="recipient-amount">
        <label><small>AMOUNT ({currency})</small><input inputMode="decimal" value={row(person).amount} onChange={(e) => { clearVerdicts(); setRow(person.id, { amount: e.target.value }); }} placeholder="Not allocated" disabled={!editable} /></label>
        {person.groupSize > 1 && <label><small>THAT AMOUNT IS</small><select value={row(person).basis} onChange={(e) => { clearVerdicts(); setRow(person.id, { basis: e.target.value as Row["basis"] }); }} disabled={!editable}><option value="group_total">the whole group</option><option value="per_person">each person</option></select></label>}
      </div>
      {person.groupSize > 1 && row(person).basis === "per_person" && valid(row(person).amount) && <p className="recipient-note">{person.groupSize} × {price(toCents(row(person).amount, currency), currency)} = <b>{price(toCents(row(person).amount, currency) * person.groupSize, currency)}</b></p>}
    </article>)}</div>

    {conflicts.map((conflict) => <div className="blocked-panel" key={conflict.equalValueGroup} role="alert"><i><IconAlert /></i><b>“{conflict.equalValueGroup}” gifts are meant to be equal</b><p>These came in on different amounts: {conflict.amounts.map((cents) => price(cents, currency)).join(", ")}. Trail will not level them up — putting a number in your plan you never said is worse than asking.</p><small>Set them to the same amount, or take the equal-value tag off one of them in a chat with Trail.</small></div>)}

    {overrun && <div className="blocked-panel" role="alert"><i><IconAlert /></i><b>{price(overrun.overCents, currency)} over the shopping bucket</b>
      <p>Your split comes to {price(overrun.allocatedCents, currency)} and the planned bucket is {price(overrun.plannedCents, currency)}. Nothing has been saved.</p>
      <small>{overrun.coveredByFlexible ? "Trail can move the difference out of your flexible budget — that is your call, not ours." : "Your flexible budget does not cover all of it. Lower a gift, or raise the trip total in a chat with Trail."}</small>
      <div className="blocked-actions">{overrun.coveredByFlexible && <button onClick={() => void ask()} disabled={busy}>Raise it for approval</button>}<button onClick={clearVerdicts}>Change the split</button></div>
    </div>}

    {problem && <p className="form-error" role="alert">{problem}</p>}

    {editable
      ? <button className="main-button dark" onClick={() => void save()} disabled={busy || !planId}><span>{busy ? "Saving…" : "Save this split"}<small>Replaces the whole split. Nothing is rounded.</small></span><i><IconCheck /></i></button>
      : <p className="quiet-note">This plan is approved, so the split is fixed. Changing it is a budget change.</p>}

    {adding
      ? <section className="area-planner"><header><span><small>ADD SOMEONE</small><b>Who else are you shopping for?</b></span></header>
          <label className="stacked"><small>NAME</small><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mom" autoFocus /></label>
          <label className="stacked"><small>RELATIONSHIP</small><input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Mother" /></label>
          <label className="stacked"><small>HOW MANY PEOPLE</small><input type="number" min={1} max={30} value={groupSize} onChange={(e) => setGroupSize(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></label>
          <div className="store-actions"><button onClick={() => void add()} disabled={busy || !name.trim()}>Add them</button><button onClick={() => { setAdding(false); setProblem(""); }}>Cancel</button></div>
        </section>
      : <button className="back-to-chat" onClick={() => setAdding(true)}><IconPlus /> Add someone to this trip</button>}

    <button className="back-to-chat" onClick={() => router.push("/ask")}>Tell Trail instead <IconArrow /></button>
  </>;
}
