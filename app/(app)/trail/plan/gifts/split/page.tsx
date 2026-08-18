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
import { useTrip, type AllocationEntry } from "../../../../app-state";
import { toMinor } from "@/lib/money/format";
import { TIERS, TIER_HINT, TIER_LABEL, tierOf, tierWrite, trimToFit, type PriorityTier } from "@/lib/budget/priority";
import { money, price } from "../../../../view";
import type { Recipient } from "@/lib/state/types";

type Row = { amount: string; basis: "per_person" | "group_total" };
type Trimmed = { count: number; before: Record<string, string> };
type Conflict = { equalValueGroup: string; recipientIds: string[]; amounts: number[] };
type Overrun = { overCents: number; allocatedCents: number; plannedCents: number; coveredByFlexible: boolean; proposal: Record<string, unknown> };

const seedRow = (person: Recipient, currency: string): Row => ({ amount: person.allocationCents === null ? "" : money(person.allocationCents, currency), basis: "group_total" });
const toCents = (value: string, currency: string) => toMinor(Number(value), currency);
const valid = (amount: string) => amount.trim() !== "" && Number.isFinite(Number(amount)) && Number(amount) >= 0;

export default function PeopleLens() {
  const router = useRouter();
  const { recipients, wallet, currency, planId, serverPlan, pendingBudgetChange, addRecipient, archiveRecipient, updateRecipient, saveAllocations, proposeBudgetChange, notify } = useTrip();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overrun, setOverrun] = useState<Overrun | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [problem, setProblem] = useState("");
  /** The mark is not money, so it is sent on the tap rather than held in a draft. It does not
   *  go through the outbox either (`app-state.tsx`), so a failure is shown and reverted — the
   *  optimistic value is dropped whatever the answer and the server's value renders again. */
  const [marks, setMarks] = useState<Record<string, PriorityTier>>({});
  const [marking, setMarking] = useState("");
  const [markFailed, setMarkFailed] = useState<Record<string, "offline" | "failed">>({});
  const [trimmed, setTrimmed] = useState<Trimmed | null>(null);

  const row = (person: Recipient): Row => rows[person.id] ?? seedRow(person, currency);
  const setRow = (id: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [id]: { ...(current[id] ?? { amount: "", basis: "group_total" as const }), ...patch } }));

  const entries: AllocationEntry[] = useMemo(() => recipients.map((person) => ({ person, entry: rows[person.id] ?? seedRow(person, currency) })).filter(({ entry }) => valid(entry.amount)).map(({ person, entry }) => ({ recipientId: person.id, amountCents: toCents(entry.amount, currency), basis: entry.basis })), [currency, recipients, rows]);
  // What the split comes to, read the way the server will read it: a per-person
  // figure is multiplied by the group before anything is compared to the bucket.
  const resolved = entries.map((entry) => ({ recipientId: entry.recipientId, amountCents: entry.amountCents * (entry.basis === "per_person" ? recipients.find((p) => p.id === entry.recipientId)?.groupSize ?? 1 : 1) }));
  const plannedTotal = resolved.reduce((sum, entry) => sum + entry.amountCents, 0);
  const over = plannedTotal - wallet.plannedCents;
  const editable = serverPlan?.status === "draft";

  const clearVerdicts = () => { setOverrun(null); setConflicts([]); setProblem(""); setTrimmed(null); };

  const tierFor = (person: Recipient) => marks[person.id] ?? tierOf(person);
  const musts = recipients.filter((person) => tierFor(person) === "must").length;
  /** Priority stays editable on an approved plan on purpose: it moves no money, and the moment
   *  this feature earns its keep is in a shop after approval. `editable` gates the amounts only. */
  const setTier = async (person: Recipient, tier: PriorityTier) => {
    if (tierFor(person) === tier) return;
    setMarks((current) => ({ ...current, [person.id]: tier })); setMarking(person.id);
    setMarkFailed((current) => { const next = { ...current }; delete next[person.id]; return next; });
    const reply = await updateRecipient(person.id, tierWrite(tier));
    setMarking(""); setMarks((current) => { const next = { ...current }; delete next[person.id]; return next; });
    if (!reply.ok) setMarkFailed((current) => ({ ...current, [person.id]: reply.status === 0 ? "offline" : "failed" }));
  };

  /** The remedy that writes nothing. It fills the inputs and says so; `Save this split` is still
   *  the only thing that sends, through the same route and the same 409. Amounts are dropped
   *  whole rather than scaled, because a trimmed 68 that comes back as 47 is a number the
   *  traveller never said. */
  const marked = recipients.map((person) => ({ id: person.id, createdAt: person.createdAt, equalValueGroup: person.equalValueGroup, ...tierWrite(tierFor(person)) }));
  const trimPlan = overrun ? trimToFit(resolved, marked, overrun.plannedCents) : null;
  const applyTrim = () => {
    if (trimPlan?.kind !== "trimmed") return;
    const dropped = new Set(trimPlan.dropped.map((entry) => entry.recipientId));
    const before: Record<string, string> = {}, next: Record<string, Row> = {};
    for (const person of recipients) { const entry = row(person); next[person.id] = dropped.has(person.id) ? { ...entry, amount: "" } : entry; if (dropped.has(person.id)) before[person.id] = entry.amount; }
    setRows(next); setTrimmed({ count: dropped.size, before }); setOverrun(null);
  };

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
    <div className="result-title"><p>Who this trip is for</p><h1>Divide the<br /><em>shopping budget.</em></h1><span>Only the planned bucket can be divided. The delivery reserve is held back for your bags, and the flexible bucket needs your approval before anything touches it.</span></div>

    {pendingBudgetChange && <div className="budget-warning" role="status"><b>A budget change is waiting for you</b><span>{pendingBudgetChange.reason}</span><button onClick={() => router.push("/trail/plan/approval")}>Review it <span aria-hidden="true">→</span></button></div>}

    <section className="split-meter"><div><span><small>ALLOCATED</small><b>{price(plannedTotal, currency)}</b></span><em>of {price(wallet.plannedCents, currency)} planned</em></div><div className="range-values"><span>{recipients.length} {recipients.length === 1 ? "person" : "people"}</span><span className={over > 0 ? "over" : undefined}>{over > 0 ? `${price(over, currency)} over` : `${price(-over, currency)} left to divide`}</span></div></section>

    {recipients.length > 0 && <p className="quiet-note">{musts === 0 ? "Nothing is marked must buy. Trail treats every gift the same when money is short." : musts === recipients.length ? "Everyone is marked must buy, so there is nothing for Trail to suggest cutting." : TIER_HINT}</p>}
    {trimmed && <div className="notice notice--warn" role="status"><IconAlert /><b>Nothing is saved yet.</b><p>Amounts changed for {trimmed.count} {trimmed.count === 1 ? "person" : "people"}. Save the split to keep it.</p></div>}

    {!recipients.length && <div className="offline-note"><b>Nobody is on this trip yet.</b><span>Add the people you are shopping for, or tell Trail about them in a chat and apply what it suggests.</span></div>}

    <div className="recipient-list">{recipients.map((person) => <article key={person.id}>
      <div className="recipient-head"><i><IconPeople /></i><span><b>{person.name}{person.isSelf ? " (you)" : ""}</b><small>{[person.relationship, person.groupSize > 1 ? `group of ${person.groupSize}` : "", person.equalValueGroup ? `equal value: ${person.equalValueGroup}` : ""].filter(Boolean).join(" · ") || "No details yet"}</small></span><button type="button" onClick={() => void archive(person)} disabled={busy} aria-label={`Remove ${person.name} from this trip`}>Remove</button></div>
      {person.preferenceNote && <p className="recipient-note">{person.preferenceNote}</p>}
      <fieldset className="priority-set"><legend className="section-label">If money runs short{marking === person.id && <span className="badge badge--pending">SAVING</span>}</legend>
        <div className="choice-row">{TIERS.map((tier) => <label className="choice choice--seg" key={tier}><input type="radio" name={`prio-${person.id}`} value={tier} checked={tierFor(person) === tier} onChange={() => void setTier(person, tier)} /><span><b>{TIER_LABEL[tier]}</b></span><i className="choice-check"><IconCheck /></i></label>)}</div>
      </fieldset>
      {markFailed[person.id] === "offline" && <div className="notice notice--offline" role="alert"><IconAlert /><b>You are offline.</b><p>That mark was not saved.</p></div>}
      {markFailed[person.id] === "failed" && <p className="form-error" role="alert">Trail could not save that mark.</p>}
      <div className="recipient-amount">
        <label><small>AMOUNT ({currency})</small><input inputMode="decimal" value={row(person).amount} onChange={(e) => { clearVerdicts(); setRow(person.id, { amount: e.target.value }); }} placeholder="Not allocated" disabled={!editable} /></label>
        {person.groupSize > 1 && <label><small>THAT AMOUNT IS</small><select value={row(person).basis} onChange={(e) => { clearVerdicts(); setRow(person.id, { basis: e.target.value as Row["basis"] }); }} disabled={!editable}><option value="group_total">the whole group</option><option value="per_person">each person</option></select></label>}
      </div>
      {person.groupSize > 1 && row(person).basis === "per_person" && valid(row(person).amount) && <p className="recipient-note">{person.groupSize} × {price(toCents(row(person).amount, currency), currency)} = <b>{price(toCents(row(person).amount, currency) * person.groupSize, currency)}</b></p>}
      {tierFor(person) === "must" && !valid(row(person).amount) && <p className="recipient-note">Marked must buy with no amount set.</p>}
      {trimmed && valid(trimmed.before[person.id] ?? "") && <p className="recipient-note">{person.name}: {price(toCents(trimmed.before[person.id], currency), currency)} → not allocated</p>}
    </article>)}</div>

    {conflicts.map((conflict) => <div className="blocked-panel" key={conflict.equalValueGroup} role="alert"><i><IconAlert /></i><b>“{conflict.equalValueGroup}” gifts are meant to be equal</b><p>These came in on different amounts: {conflict.amounts.map((cents) => price(cents, currency)).join(", ")}. Trail will not level them up — putting a number in your plan you never said is worse than asking.</p><small>Set them to the same amount, or take the equal-value tag off one of them in a chat with Trail.</small></div>)}

    {overrun && <div className="blocked-panel" role="alert"><i><IconAlert /></i><b>{price(overrun.overCents, currency)} over the shopping bucket</b>
      <p>Your split comes to {price(overrun.allocatedCents, currency)} and the planned bucket is {price(overrun.plannedCents, currency)}. Nothing has been saved.</p>
      <small>{overrun.coveredByFlexible ? "Trail can move the difference out of your flexible budget — that is your call, not ours." : "Your flexible budget does not cover all of it. Lower a gift, or raise the trip total in a chat with Trail."}</small>
      {musts > 0 && trimPlan?.kind === "no_fit" && <small>Even the must-buy gifts come to {price(trimPlan.mustCents, currency)}. Your shopping bucket holds {price(trimPlan.limitCents, currency)}.</small>}
      <div className="blocked-actions">{overrun.coveredByFlexible && <button onClick={() => void ask()} disabled={busy}>Raise it for approval</button>}{musts > 0 && trimPlan?.kind === "trimmed" && <button onClick={applyTrim}>Suggest a split that keeps the must-buys</button>}<button onClick={clearVerdicts}>Change the split</button></div>
    </div>}

    {problem && <p className="form-error" role="alert">{problem}</p>}

    {editable
      ? <button className="main-button dark" onClick={() => void save()} disabled={busy || !planId}><span>{busy ? "Saving…" : "Save this split"}<small>Replaces the whole split. Nothing is rounded.</small></span><i><IconCheck /></i></button>
      : <p className="quiet-note">This plan is approved, so the split is fixed. Changing it is a budget change.</p>}

    {adding
      ? <section className="area-planner"><header><span><small>Add someone</small><b>Who else are you shopping for?</b></span></header>
          <label className="stacked"><small>NAME</small><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mom" autoFocus /></label>
          <label className="stacked"><small>RELATIONSHIP</small><input value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Mother" /></label>
          <label className="stacked"><small>HOW MANY PEOPLE</small><input type="number" min={1} max={30} value={groupSize} onChange={(e) => setGroupSize(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></label>
          <div className="store-actions"><button onClick={() => void add()} disabled={busy || !name.trim()}>Add them</button><button onClick={() => { setAdding(false); setProblem(""); }}>Cancel</button></div>
        </section>
      : <button className="back-to-chat" onClick={() => setAdding(true)}><IconPlus /> Add someone to this trip</button>}

    <button className="back-to-chat" onClick={() => router.push("/ask")}>Tell Trail instead <IconArrow /></button>
  </>;
}
