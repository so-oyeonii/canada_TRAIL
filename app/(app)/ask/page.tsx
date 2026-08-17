"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { describePatch, errorMessage, rejectionMessage, type ChatReply, type PlanKey } from "@/app/trail-brief";
import { Header } from "@/components/chrome";
import { IconChevronRight, IconClose, IconPlus, IconSend, IconSpark } from "@/components/icons";
import { starters, useApp } from "../app-state";
import { money } from "../view";

export default function AskPage() {
  const app = useApp();
  const router = useRouter();
  const { trip, plan, wallet, messages, setMessages, input, setInput, thinking, setThinking, suggestion, setSuggestion, memoryEnabled, applyPatch, clearFields, notify } = app;
  // The AI is told about the trip the server holds. It never sees an id, an
  // address it could name to a store, or anything the traveler has not typed.
  const context = { city: trip.city, country: trip.country, areas: trip.areas, hotel: trip.hotelName, freeTime: trip.freeTime, companions: trip.companions, currency: trip.currency };
  const [attachmentName, setAttachmentName] = useState("");

  const sendMessage = async (text: string) => {
    const clean = text.trim(); if (!clean || thinking) return;
    const history = messages.slice(-12);
    setMessages((current) => [...current, { role: "user", text: clean }]); setInput(""); setSuggestion(null); setThinking(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: clean, plan, trip: context, history }) });
      const data = (await response.json()) as ChatReply & { clear?: PlanKey[] };
      applyPatch(data.patch); clearFields(data.clear ?? []);
      setMessages((current) => [...current, { role: "ai", text: data.reply }]);
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
  const attachImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; setAttachmentName(file.name); setMessages((current) => [...current, { role: "user", text: `Attached reference photo: ${file.name}` }, { role: "ai", text: "I’ll treat this as a visual reference for the shopping brief. The prototype keeps the file on this device and does not upload it." }]); notify("Reference photo attached locally"); };

  return <div className="screen chat-screen"><Header title="Ask Trail" back={() => router.push("/trail")} action={<button className="text-action" onClick={() => router.push("/ask/brief")}>View brief</button>} />
    <h1 className="visually-hidden">Ask Trail</h1>
    <div className="chat-status"><i><IconSpark /></i><span><b>Trail AI · prototype</b><small>{trip.areas.length} areas · transfer checked after purchase</small></span><em>{memoryEnabled ? "MEMORY ON" : "MEMORY OFF"}</em></div>
    <div className="memory-strip"><span><small>{memoryEnabled ? "TRAIL REMEMBERS" : "TRAIL MEMORY IS OFF"}</small><b>{memoryEnabled ? "Local makers · useful gifts · easy to carry home" : "Recommendations use this trip only"}</b></span><button onClick={() => router.push("/account/memory")}>Why?</button></div>
    {messages.length === 1 && <section className="starter-section"><div className="section-label"><b>What are you looking for?</b><span>Tell Trail naturally</span></div><div className="starter-list">{starters.map((item) => <button key={item.title} onClick={() => sendMessage(item.prompt)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.prompt}</small></span><em><IconChevronRight /></em></button>)}</div></section>}
    <div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.role === "ai" && <i><IconSpark /></i>}<p>{message.text}</p></div>)}{thinking && <div className="message ai typing"><i><IconSpark /></i><p><span /><span /><span /></p></div>}</div>
    {suggestion && <div className="suggestion-chip"><span><small>I UNDERSTOOD</small><b>{describePatch(suggestion).join(" · ")}</b></span><button onClick={acceptSuggestion}>Add to brief</button><button className="ghost" onClick={() => setSuggestion(null)} aria-label="Dismiss suggestion"><IconClose /></button></div>}
    <div className="quick-replies"><button onClick={() => sendMessage(trip.areas.length ? `Find stores along ${trip.areas.slice(0, 2).join(" and ")}.` : `Find stores in ${trip.city}.`)}>Along my route</button><button onClick={() => sendMessage("I want hotel bag transfer for anything heavy, fragile or chilled.")}>Hands-free all day</button><button onClick={() => sendMessage(`My gift budget is ${trip.currency} ${money(wallet.plannedCents)}.`)}>Budget {trip.currency} ${money(wallet.plannedCents)}</button></div>
    <div className="live-draft"><span><small>SHOPPING BRIEF</small><b>{plan.recipient} · {plan.category}</b></span><strong>${plan.budget}</strong><button onClick={() => router.push("/ask/brief")}>Review</button></div>
    {attachmentName && <div className="attachment-chip">Reference: {attachmentName}<button onClick={() => setAttachmentName("")} aria-label="Remove attachment"><IconClose /></button></div>}
    <form className="chat-input" onSubmit={submit}><input id="trail-reference" className="visually-hidden" type="file" accept="image/*" onChange={attachImage} /><button type="button" aria-label="Add reference photo" onClick={() => document.getElementById("trail-reference")?.click()}><IconPlus /></button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="What do you want to bring home?" aria-label="Message Trail" /><button type="submit" aria-label="Send message" disabled={!input.trim() || thinking}><IconSend /></button></form>
  </div>;
}
