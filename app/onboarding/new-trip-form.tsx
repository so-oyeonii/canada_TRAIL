"use client";

/** The four-step form, now on `/onboarding/form`.
 *
 *  It is not deleted and it is not a duplicate: `Edit details` in the chip conversation lands here,
 *  because changing one of six answers is faster than being asked all six again. Every piece of
 *  state, every check and the one `POST /api/trips` moved into `useTripDraft`, so the two screens
 *  cannot come to different conclusions about what a valid trip is. */

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/chrome";
import { IconArrow, IconCheck, IconClose, IconPlus } from "@/components/icons";
import { currencySymbol } from "../../lib/money/format";
import { FREE_TIME } from "../../lib/trips/input";
import { PREFERENCE_TAGS, PREFERENCE_TAG_LABEL } from "../trail-brief";
import { ONBOARDING_CURRENCIES, totalCeiling, totalFloor, useTripDraft } from "./trip-draft";
import "./onboarding.css";

const STEPS = ["Where", "When", "Base", "Budget"];

export default function NewTripForm({ email }: { email: string }) {
  const router = useRouter();
  const draft = useTripDraft();
  const { value, set, toggleTag } = draft;
  const [step, setStep] = useState(0);
  const [areaDraft, setAreaDraft] = useState("");
  const floor = totalFloor(value.currency), ceiling = totalCeiling(value.currency);

  const canContinue = [draft.canAnswer("city"), draft.datesValid, draft.canAnswer("hotelName"), draft.canAnswer("total")][step];

  const addArea = () => {
    const area = areaDraft.trim();
    if (!area || value.areas.includes(area)) return;
    set("areas", [...value.areas, area]);
    setAreaDraft("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canContinue) return;
    const { ok } = await draft.submit();
    if (ok) { router.push("/"); router.refresh(); }
  };

  return <div className="app-shell"><main className="app-main onboarding-screen">
    <header className="app-header"><Brand /><div className="header-action"><span className="draft-badge">{email}</span></div></header>

    <div className="onboarding-progress">{STEPS.map((label, index) => <span key={label} className={index <= step ? "on" : ""}><i /><small>{label}</small></span>)}</div>

    <form className="onboarding-form" onSubmit={submit}>
      {step === 0 && <>
        <div className="onboarding-intro"><p>Step 1 · Where</p><h1>Where are you<br />travelling?</h1><small>Trail matches stores to the neighbourhoods you will actually walk through.</small></div>
        <div className="date-pair"><label><small>COUNTRY</small><input value={value.country} onChange={(e) => set("country", e.target.value)} placeholder="Canada" autoFocus /></label><label><small>CITY</small><input value={value.city} onChange={(e) => set("city", e.target.value)} placeholder="Toronto" /></label></div>
        <section className="area-planner"><header><span><small>AREAS I’LL VISIT</small><b>Optional — add them any time</b></span><strong>{value.areas.length}</strong></header>
          <div className="area-chips">{value.areas.map((area) => <button type="button" key={area} aria-label={`Remove ${area}`} onClick={() => set("areas", value.areas.filter((item) => item !== area))}>{area}<i><IconClose /></i></button>)}</div>
          <div className="area-add"><input value={areaDraft} onChange={(e) => setAreaDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArea(); } }} placeholder="Kensington Market…" aria-label="Area to visit" /><button type="button" onClick={addArea} disabled={!areaDraft.trim()}><IconPlus /> Add</button></div>
        </section>
      </>}

      {step === 1 && <>
        <div className="onboarding-intro"><p>Step 2 · When</p><h1>How long are<br />you there?</h1><small>Used to work out which day each stop belongs to. You can leave dates empty for now.</small></div>
        <div className="date-pair"><label><small>ARRIVE</small><input type="date" value={value.startDate} onChange={(e) => set("startDate", e.target.value)} /></label><label><small>LEAVE</small><input type="date" value={value.endDate} onChange={(e) => set("endDate", e.target.value)} /></label></div>
        {!draft.datesValid && <p className="form-error" role="alert">The leaving date is before the arrival date.</p>}
        <label className="stacked"><small>Time free for shopping</small><select value={value.freeTime} onChange={(e) => set("freeTime", e.target.value)}>{FREE_TIME.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="stacked"><small>Travelling with</small><input value={value.companions} onChange={(e) => set("companions", e.target.value)} placeholder="Solo trip" /></label>
      </>}

      {step === 2 && <>
        <div className="onboarding-intro"><p>Step 3 · Base</p><h1>Where should<br />bags go?</h1><small>Your hotel is the delivery address for every bag you send from a partner store.</small></div>
        <label className="stacked"><small>HOTEL</small><input value={value.hotelName} onChange={(e) => set("hotelName", e.target.value)} placeholder="The Annex Hotel" autoFocus /></label>
        <label className="stacked"><small>HOTEL ADDRESS</small><input value={value.hotelAddress} onChange={(e) => set("hotelAddress", e.target.value)} placeholder="296 Brunswick Ave" /></label>
        <div className="ownership-note">Trail keeps the address for delivery only. It is never sent to the stores you visit or to the AI.</div>
      </>}

      {step === 3 && <>
        <div className="onboarding-intro"><p>Step 4 · Budget</p><h1>One budget for<br />the whole trip.</h1><small>Trail splits it so the delivery fee is protected before you start spending.</small></div>
        <label className="stacked"><small>CURRENCY</small><select value={value.currency} onChange={(e) => { const code = e.target.value; set("currency", code); set("total", Math.max(totalFloor(code), Math.min(totalCeiling(code), value.total))); }}>{ONBOARDING_CURRENCIES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <div className="budget-editor"><div><span><small>TOTAL TRIP BUDGET</small><b>{value.currency} {currencySymbol(value.currency)}{value.total}</b></span></div><input type="range" min={floor} max={ceiling} step={10 * (floor / 40)} value={value.total} aria-label={`Total budget in ${value.currency}`} onChange={(e) => set("total", Number(e.target.value))} /><div className="range-values"><span>{floor}</span><span>{ceiling}</span></div></div>
        <section className="bucket-preview">
          <span><i className="planned" /><small>Planned shopping</small><b>{value.currency} {currencySymbol(value.currency)}{draft.buckets.planned}</b></span>
          <span><i className="reserve" /><small>Reserved for delivery</small><b>{value.currency} {currencySymbol(value.currency)}{draft.buckets.reserve}</b><em>{draft.quoted ? `Quoted for ${value.city.trim()}` : "Trail’s standard rate"}</em></span>
          <span><i className="flex" /><small>Flexible</small><b>{value.currency} {currencySymbol(value.currency)}{draft.buckets.flexible}</b></span>
        </section>
        <section className="area-planner"><header><span><small>Preferences</small><b>Trail matches picks to these</b></span><strong>{value.preferenceTags.length}</strong></header>
          <div className="chip-row" role="group" aria-label="Shopping preferences">{PREFERENCE_TAGS.map((tag) => <button type="button" key={tag} className="chip--button" aria-pressed={value.preferenceTags.includes(tag)} onClick={() => toggleTag(tag)}>{PREFERENCE_TAG_LABEL[tag]}</button>)}</div>
        </section>
        <div className="ownership-note">Only the planned amount is spendable while you shop. The protected amount is the bag delivery fee Trail quotes for this city — it is not an estimate made on this phone. Moving money out of flexible needs your approval. Preferences stay a draft on this device until your plan is built.</div>
      </>}

      {draft.error && <p className="form-error" role="alert">{draft.error}</p>}

      <div className="onboarding-actions">
        {step > 0 && <button type="button" className="back-to-chat" onClick={() => setStep(step - 1)}>Back</button>}
        {step < STEPS.length - 1
          ? <button type="button" className="main-button" disabled={!canContinue} onClick={() => setStep(step + 1)}><span>Continue<small>{STEPS[step + 1]}</small></span><IconArrow /></button>
          : <button type="submit" className="main-button dark" disabled={draft.saving || !canContinue}><span>{draft.saving ? "Saving your trip…" : "Create my Trail plan"}<small>You can change any of this later</small></span><IconCheck /></button>}
      </div>
    </form>
  </main></div>;
}
