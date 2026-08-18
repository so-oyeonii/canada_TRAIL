"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { chipsFor, type Chip } from "@/app/ask-chips";
import { describePatch, errorMessage, rejectionMessage, type AskedField, type ChatReply, type Confirm, type RecipientOp } from "@/app/trail-brief";
import { TIER_LABEL, tierOf } from "@/lib/budget/priority";
import { AskSummary } from "@/components/ask-summary";
import { Bubble, ChipRow, Typing } from "@/components/chat";
import { Avatar, Header } from "@/components/chrome";
import { IconChevronRight, IconClose, IconPlus, IconSend } from "@/components/icons";
import { greeting, starters, useTrip } from "../app-state";
import { dateRange } from "../view";
import { missingFields, readyToPlan, toGoLabel } from "./ready";
import { applyReply, chatPayload, refMap, summaryInput, takeWindow, type AskApp } from "./wiring";
import "@/app/ask.css";

export default function AskPage() {
  const app = useTrip();
  const router = useRouter();
  const { trip, wallet, recipients, messages, setMessages, input, setInput, thinking, setThinking, suggestion, setSuggestion, memoryEnabled, applyPatch, applyTags, clearFields, clearTags, applyRecipientOps, archiveRecipient, proposeBudgetChange, approvePlan, notify } = app;
  const [attachmentName, setAttachmentName] = useState("");
  const [asked, setAsked] = useState<AskedField | null>(null);
  const [awaiting, setAwaiting] = useState<Confirm | null>(null);
  const [overrun, setOverrun] = useState<Record<string, unknown> | null>(null);
  /** A window handed over by `/trail/spare`, spent on the first turn and then gone. It is
   *  read once because it stops being true shortly after it was set — a window still riding
   *  along on turn six would have Trail reasoning about an afternoon that has ended. */
  const spare = useRef<import("@/app/trail-brief").SpareWindow | null>(null);
  useEffect(() => { spare.current = takeWindow(); }, []);

  const askApp: AskApp = app;
  const summary = summaryInput(askApp);
  const ready = readyToPlan(summary);
  const left = missingFields(summary);

  const sendMessage = async (text: string) => {
    const clean = text.trim(); if (!clean || thinking) return;
    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: "user", text: clean }]); setInput(""); setSuggestion(null); setThinking(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chatPayload(askApp, clean, history, spare.current)) });
      spare.current = null;
      const data = (await response.json()) as ChatReply;
      setMessages((current) => [...current, { role: "ai", text: data.reply }]);
      // Everything the answer carries lands here, in one place a test can reach.
      const turn = await applyReply(data, refMap(recipients), { applyRecipientOps, archiveRecipient, proposeBudgetChange, applyPatch, applyTags, clearFields, clearTags, notify }, { reserveCents: wallet.reserveCents });
      setAsked(turn.askedField); setAwaiting(turn.awaiting); setOverrun(turn.overrun);
      if (data.suggested && Object.keys(data.suggested).length) setSuggestion(data.suggested);
      const rejection = rejectionMessage(data.rejected ?? []);
      if (rejection) setMessages((current) => [...current, { role: "ai", text: rejection }]);
      else if (data.errorCode) notify(errorMessage(data.errorCode));
    } catch {
      setMessages((current) => [...current, { role: "ai", text: "I could not reach Trail AI just now. Your brief is unchanged." }]); notify("Trail AI is offline");
    } finally { setThinking(false); }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); sendMessage(input); };
  const acceptSuggestion = () => { if (!suggestion) return; applyPatch(suggestion); setSuggestion(null); notify("Added to your brief"); };
  /** A removal only ever happens on this tap, and since N3 so does a ranking: `sanitizeRecipientOps`
   *  splits `priority`/`is_optional` into a twin op that lands here instead of in the draft. Both are
   *  judgements about a person, and neither is applied by the same code path that archives one —
   *  this used to call `archiveRecipient` for every op, remove or not. */
  const labelFor = (ref: string | null) => { const id = ref ? refMap(recipients).get(ref) : null; return recipients.find((person) => person.id === id)?.name ?? "this person"; };
  const tierOp = (op: RecipientOp) => op.fields.priority !== undefined || op.fields.isOptional !== undefined;
  const tierWord = (op: RecipientOp) => TIER_LABEL[tierOf({ priority: op.fields.priority ?? 3, isOptional: op.fields.isOptional ?? false })];
  const dismissOp = (op: RecipientOp) => setAwaiting((current) => { if (!current) return current; const recipientOps = current.recipientOps.filter((entry) => entry !== op); return recipientOps.length || current.wallet || current.budget ? { ...current, recipientOps } : null; });
  const confirmOp = async (op: RecipientOp) => {
    const id = op.ref ? refMap(recipients).get(op.ref) : null;
    if (!id) return;
    if (op.op === "remove") { await archiveRecipient(id); notify("Removed from your draft"); }
    else { const reply = await applyRecipientOps([op], Object.fromEntries(refMap(recipients))); notify(reply.ok ? "Saved to your draft" : reply.status === 409 ? "This plan is approved, so that is a budget change." : "Trail could not save that."); }
    dismissOp(op);
  };
  const sendOverrun = async () => { if (!overrun) return; await proposeBudgetChange(overrun); setOverrun(null); router.push("/trail/plan/approval"); };
  const attachImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setAttachmentName(file.name); setMessages((current) => [...current, { role: "user", text: `Attached reference photo: ${file.name}` }, { role: "ai", text: "I’ll treat this as a visual reference for the shopping brief. The prototype keeps the file on this device and does not upload it." }]); notify("Reference photo attached locally"); };

  const context = [trip.city, dateRange(trip.startDate, trip.endDate), trip.currency, trip.hotelName].filter(Boolean).join(" · ");
  const chips = chipsFor(asked, { recipients: recipients.map((person) => ({ label: person.name })), currency: trip.currency, areas: trip.areas });

  return <div className="screen chat-screen"><Header title="Trail AI" action={<><span className={`badge ${ready ? "badge--done" : ""}`}>{toGoLabel(summary)}</span><Avatar city={trip.city} /></>} />
    <h1 className="visually-hidden">Trail AI</h1>
    <p className="ask-context">{context}</p>
    {!memoryEnabled && <p className="ask-memory">Recommendations use this trip only · <button className="text-action" onClick={() => router.push("/account/memory")}>Why?</button></p>}
    {messages.length === 0 && <section className="starter-section"><div className="starter-head"><b>What are you looking for?</b><span>Tell Trail naturally</span></div><div className="starter-list">{starters.map((item) => <button key={item.title} onClick={() => (item.href ? router.push(item.href) : sendMessage(item.prompt))}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.prompt}</small></span><em><IconChevronRight /></em></button>)}</div></section>}
    <div className="messages" role="log" aria-live="polite"><Bubble role="ai">{greeting(trip.city).text}</Bubble>{messages.map((message, index) => <Bubble role={message.role} key={`${message.role}-${index}`}>{message.text}</Bubble>)}{thinking && <Typing />}</div>

    {awaiting?.recipientOps.map((op, index) => <div className="suggestion-chip" key={`${op.op}-${op.ref}-${index}`}><span><small>Waiting on you</small><b>{op.op === "remove" ? "Drop this person from the draft" : tierOp(op) ? `Trail suggests marking ${labelFor(op.ref)} as ${tierWord(op)}.` : "Change this person in the draft"}</b></span><button onClick={() => void confirmOp(op)}>{tierOp(op) ? "Apply" : "Confirm"}</button><button className="ghost" onClick={() => dismissOp(op)} aria-label={tierOp(op) ? "Leave it" : "Dismiss"}><IconClose /></button></div>)}
    {awaiting?.wallet && <div className="suggestion-chip"><span><small>Needs your approval</small><b>Switch this trip to {awaiting.wallet.currency}</b></span><button onClick={() => { setAwaiting(null); router.push("/trail/plan/budget"); }}>Review</button><button className="ghost" onClick={() => setAwaiting(null)} aria-label="Dismiss"><IconClose /></button></div>}
    {overrun && <div className="suggestion-chip"><span><small>NEEDS YOUR APPROVAL</small><b>That split is larger than your shopping budget</b></span><button onClick={sendOverrun}>Review</button><button className="ghost" onClick={() => setOverrun(null)} aria-label="Dismiss"><IconClose /></button></div>}
    {suggestion && <div className="suggestion-chip"><span><small>What Trail heard</small><b>{describePatch(suggestion).join(" · ")}</b></span><button onClick={acceptSuggestion}>Add to brief</button><button className="ghost" onClick={() => setSuggestion(null)} aria-label="Dismiss suggestion"><IconClose /></button></div>}

    {ready && <AskSummary {...summary} onEdit={() => router.push("/ask/brief")} onCreate={() => { approvePlan(); router.push("/trail/plan/gifts"); }} />}
    <ChipRow chips={chips} onPick={(chip: Chip) => sendMessage(chip.send)} busy={thinking} label="Suggested answers" />
    {!ready && !chips.length && <p className="ask-todo">Still to go: {left.join(", ")}</p>}

    {attachmentName && <div className="attachment-chip">Reference: {attachmentName}<button onClick={() => setAttachmentName("")} aria-label="Remove attachment"><IconClose /></button></div>}
    <form className="chat-input" onSubmit={submit}><input id="trail-reference" className="visually-hidden" type="file" accept="image/*" onChange={attachImage} /><button type="button" aria-label="Add reference photo" onClick={() => document.getElementById("trail-reference")?.click()}><IconPlus /></button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="What do you want to bring home?" aria-label="Message Trail" /><button type="submit" aria-label="Send message" disabled={!input.trim() || thinking}><IconSend /></button></form>
  </div>;
}
