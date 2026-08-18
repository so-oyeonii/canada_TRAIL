"use client";

/** The onboarding conversation. Six questions, no model, no network except the one `POST /api/trips`
 *  and the fee quote — both of which live in `useTripDraft`, the same hook the form uses.
 *
 *  Going back is tapping an answer you already gave: the amber bubbles are buttons. That is why
 *  there is no separate `Back` control and why the progress indicator is a `progressbar` rather
 *  than four dots — the dots could not say which of six answers you were on. */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Brand } from "@/components/chrome";
import { IconArrow, IconCheck } from "@/components/icons";
import { currencySymbol } from "../../lib/money/format";
import { PREFERENCE_TAGS, PREFERENCE_TAG_LABEL } from "../trail-brief";
import { CLOSING_LINE, CREATE_CTA, TRIP_SCRIPT } from "./script";
import { ONBOARDING_CURRENCIES, totalCeiling, totalFloor, useTripDraft } from "./trip-draft";
import "./onboarding.css";

export default function ChipChat({ email }: { email: string }) {
  const router = useRouter();
  const draft = useTripDraft();
  const { value, set, toggleTag } = draft;
  const [step, setStep] = useState(0);
  const [answered, setAnswered] = useState<number[]>([]);

  const current = TRIP_SCRIPT[Math.min(step, TRIP_SCRIPT.length - 1)];
  const done = step >= TRIP_SCRIPT.length;
  const canGo = draft.canAnswer(current.id) || !current.required;
  const floor = totalFloor(value.currency), ceiling = totalCeiling(value.currency);

  // Only what has actually been answered. The line is built from the values that exist, with no
  // placeholder standing in for one that does not — an empty slot is not "—", it is absent.
  const context = useMemo(() => [value.city, value.startDate && value.endDate ? `${value.startDate}–${value.endDate}` : value.startDate, value.currency, value.hotelName].filter(Boolean).join(" · "), [value]);

  const answer = () => { setAnswered((current) => (current.includes(step) ? current : [...current, step])); setStep(step + 1); };
  const create = async () => { const { ok } = await draft.submit(); if (ok) { router.push("/"); router.refresh(); } };

  return <div className="app-shell"><main className="app-main onboarding-screen chip-chat">
    <header className="app-header"><Brand /><div className="header-action"><span className={`badge ${draft.complete ? "badge--done" : ""}`}>{draft.complete ? "Ready" : `${TRIP_SCRIPT.filter((s) => s.required && !draft.canAnswer(s.id)).length} to go`}</span></div></header>
    <h1 className="visually-hidden">Set up your first trip</h1>
    {context && <p className="ask-context">{context}</p>}
    <div className="onboarding-progress" role="progressbar" aria-label="Trip setup" aria-valuemin={0} aria-valuemax={TRIP_SCRIPT.length} aria-valuenow={Math.min(step, TRIP_SCRIPT.length)} aria-valuetext={`Question ${Math.min(step + 1, TRIP_SCRIPT.length)} of ${TRIP_SCRIPT.length}`}><i style={{ transform: `scaleX(${Math.min(step, TRIP_SCRIPT.length) / TRIP_SCRIPT.length})` }} /></div>

    <div className="messages" role="log" aria-live="polite">
      {TRIP_SCRIPT.slice(0, Math.min(step, TRIP_SCRIPT.length) + (done ? 0 : 1)).map((entry, index) => <div key={entry.id}>
        <div className="message ai"><p>{entry.ask}</p></div>
        {answered.includes(index) && <div className="message user"><button type="button" className="bubble-button" aria-label={`Change your answer to: ${entry.ask}`} onClick={() => setStep(index)}>{entry.echo(value)}</button></div>}
      </div>)}
      {done && <div className="message ai"><p>{CLOSING_LINE}</p></div>}
    </div>

    {!done && <section className="chip-answer" aria-label={current.ask}>
      {current.kind === "place" && <div className="field-pair"><label className="field"><small>CITY</small><input value={value.city} onChange={(e) => set("city", e.target.value)} placeholder="Toronto" autoFocus /></label><label className="field"><small>COUNTRY</small><input value={value.country} onChange={(e) => set("country", e.target.value)} placeholder="Canada" /></label></div>}
      {current.kind === "dates" && <><div className="field-pair"><label className="field"><small>ARRIVE</small><input type="date" value={value.startDate} onChange={(e) => set("startDate", e.target.value)} /></label><label className="field"><small>LEAVE</small><input type="date" value={value.endDate} onChange={(e) => set("endDate", e.target.value)} /></label></div>{!draft.datesValid && <p className="field-error" role="alert">The leaving date is before the arrival date.</p>}</>}
      {current.kind === "chips" && <div className="chip-row" role="group" aria-label={current.ask}>{(current.chips ?? []).map((chip) => <button type="button" key={chip} className="chip--button" aria-pressed={value.companions === chip} onClick={() => set("companions", chip)}>{chip}</button>)}</div>}
      {current.kind === "money" && <>
        <div className="chip-row" role="group" aria-label="Currency">{ONBOARDING_CURRENCIES.map((code) => <button type="button" key={code} className="chip--button" aria-pressed={value.currency === code} onClick={() => { set("currency", code); set("total", Math.max(totalFloor(code), Math.min(totalCeiling(code), value.total))); }}>{code}</button>)}</div>
        <div className="budget-editor"><div><span><small>TOTAL BUDGET</small><b>{value.currency} {currencySymbol(value.currency)}{value.total}</b></span></div><input type="range" min={floor} max={ceiling} step={10 * (floor / 40)} value={value.total} aria-label={`Total budget in ${value.currency}`} onChange={(e) => set("total", Number(e.target.value))} /><div className="range-values"><span>{currencySymbol(value.currency)}{floor}</span><span>{currencySymbol(value.currency)}{ceiling}</span></div></div>
        <p className="field-hint">Trail sets the delivery fee aside before you start spending, so a bag can always be sent. {draft.quoted ? `Quoted for ${value.city.trim()}.` : "Trail’s standard rate until the city is known."}</p>
      </>}
      {current.kind === "text" && <><label className="field"><small>HOTEL</small><input value={value.hotelName} onChange={(e) => set("hotelName", e.target.value)} placeholder="The Annex Hotel" autoFocus /></label><label className="field"><small>HOTEL ADDRESS</small><input value={value.hotelAddress} onChange={(e) => set("hotelAddress", e.target.value)} placeholder="296 Brunswick Ave" /></label><p className="field-hint">Trail keeps this for delivery only. It is never sent to the stores you visit, and never to the AI.</p></>}
      {current.kind === "tags" && <><div className="chip-row" role="group" aria-label={current.ask}>{PREFERENCE_TAGS.map((tag) => <button type="button" key={tag} className="chip--button" aria-pressed={value.preferenceTags.includes(tag)} onClick={() => toggleTag(tag)}>{PREFERENCE_TAG_LABEL[tag]}</button>)}</div><p className="field-hint">These stay a draft on this device until your plan is built — nothing here is saved to the trip yet.</p></>}
      <div className="onboarding-actions"><button type="button" className="main-button" disabled={!canGo} onClick={answer}><span>Continue<small>{TRIP_SCRIPT[step + 1]?.ask ?? "Review everything"}</small></span><IconArrow /></button></div>
    </section>}

    {done && <>
      {draft.error && <p className="form-error" role="alert">{draft.error}</p>}
      <div className="onboarding-actions">
        <button type="button" className="back-to-chat" onClick={() => router.push("/onboarding/form")}>Edit details</button>
        <button type="button" className="main-button dark" disabled={draft.saving || !draft.complete} onClick={create}><span>{draft.saving ? "Saving your trip…" : CREATE_CTA}<small>You can change any of this later</small></span><IconCheck /></button>
      </div>
    </>}
    <p className="ownership-note">Signed in as {email}</p>
  </main></div>;
}
