"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DELIVERY_RESERVE, QUOTE_BAGS, splitBudget } from "./budget";
import { FREE_TIME, MINOR_UNITS_BY_CURRENCY } from "../../lib/trips/input";
import "./onboarding.css";

const CURRENCIES = ["CAD", "USD", "EUR", "JPY", "KRW", "GBP"];
const STEPS = ["Where", "When", "Base", "Budget"];

export default function NewTripForm({ email }: { email: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [areaDraft, setAreaDraft] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hotel, setHotel] = useState("");
  const [hotelAddress, setHotelAddress] = useState("");
  const [companions, setCompanions] = useState("Solo trip");
  const [freeTime, setFreeTime] = useState("3 hours");
  const [currency, setCurrency] = useState("CAD");
  const [total, setTotal] = useState(250);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reserve, setReserve] = useState(DELIVERY_RESERVE);
  const [quoted, setQuoted] = useState(false);

  // The protected amount is the delivery fee, and the delivery fee is quoted by
  // the server from `delivery_pricing` for the city being typed — never by this
  // form. Without an answer it falls back to the same price list's default row,
  // so the reserve can be wrong-by-city but never wrong-by-invention.
  useEffect(() => {
    const wanted = city.trim();
    if (step !== 3 || !wanted) return;
    const stop = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/dropoff-points?city=${encodeURIComponent(wanted)}&bags=${QUOTE_BAGS}`, { signal: stop.signal, headers: { accept: "application/json" } });
        if (!response.ok) return;
        const data = (await response.json()) as { quote?: { feeCents?: number; currency?: string } };
        if (typeof data.quote?.feeCents === "number") { setReserve(data.quote.feeCents / MINOR_UNITS_BY_CURRENCY(data.quote.currency)); setQuoted(true); }
      } catch { /* offline: the fallback row already covers this */ }
    }, 300);
    return () => { stop.abort(); window.clearTimeout(timer); };
  }, [step, city]);

  const buckets = useMemo(() => splitBudget(total, reserve), [total, reserve]);
  const datesValid = !startDate || !endDate || endDate >= startDate;
  const canContinue = [Boolean(country.trim() && city.trim()), datesValid, Boolean(hotel.trim()), total >= 40][step];

  const addArea = () => {
    const area = areaDraft.trim();
    if (!area || areas.includes(area)) return;
    setAreas([...areas, area]);
    setAreaDraft("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !canContinue) return;
    setSaving(true); setError("");

    // The trip and its wallet are written by `POST /api/trips`. This form used to
    // insert both rows itself, which is exactly the grant that let a browser
    // approve its own plan — the split and the delivery reserve are the server's.
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ country: country.trim(), city: city.trim(), areas, startDate: startDate || null, endDate: endDate || null, hotelName: hotel.trim(), hotelAddress: hotelAddress.trim(), companions, freeTime, currency, total }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; field?: string };
      if (!response.ok) { setError(response.status === 401 ? "Your session expired. Sign in again." : data.field ? `Check the ${data.field} field.` : "Could not save the trip."); setSaving(false); return; }
    } catch { setError("You appear to be offline. Your trip was not saved."); setSaving(false); return; }

    router.push("/");
    router.refresh();
  };

  return <div className="app-shell"><main className="app-main onboarding-screen">
    <header className="app-header"><div className="brand"><span>T</span><b>TRAIL</b></div><div className="header-action"><span className="draft-badge">{email}</span></div></header>

    <div className="onboarding-progress">{STEPS.map((label, index) => <span key={label} className={index <= step ? "on" : ""}><i /><small>{label}</small></span>)}</div>

    <form className="onboarding-form" onSubmit={submit}>
      {step === 0 && <>
        <div className="onboarding-intro"><p>STEP 1 · WHERE</p><h1>Where are you<br />travelling?</h1><small>Trail matches stores to the neighbourhoods you will actually walk through.</small></div>
        <div className="date-pair"><label><small>COUNTRY</small><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Canada" autoFocus /></label><label><small>CITY</small><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Toronto" /></label></div>
        <section className="area-planner"><header><span><small>AREAS I’LL VISIT</small><b>Optional — add them any time</b></span><strong>{areas.length}</strong></header>
          <div className="area-chips">{areas.map((area) => <button type="button" key={area} onClick={() => setAreas(areas.filter((item) => item !== area))}>{area}<i>×</i></button>)}</div>
          <div className="area-add"><input value={areaDraft} onChange={(e) => setAreaDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArea(); } }} placeholder="Kensington Market…" aria-label="Area to visit" /><button type="button" onClick={addArea} disabled={!areaDraft.trim()}>＋ Add</button></div>
        </section>
      </>}

      {step === 1 && <>
        <div className="onboarding-intro"><p>STEP 2 · WHEN</p><h1>How long are<br />you there?</h1><small>Used to work out which day each stop belongs to. You can leave dates empty for now.</small></div>
        <div className="date-pair"><label><small>ARRIVE</small><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label><small>LEAVE</small><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div>
        {!datesValid && <p className="form-error" role="alert">The leaving date is before the arrival date.</p>}
        <label className="stacked"><small>TIME FREE FOR SHOPPING</small><select value={freeTime} onChange={(e) => setFreeTime(e.target.value)}>{FREE_TIME.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="stacked"><small>TRAVELLING WITH</small><input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="Solo trip" /></label>
      </>}

      {step === 2 && <>
        <div className="onboarding-intro"><p>STEP 3 · BASE</p><h1>Where should<br />bags go?</h1><small>Your hotel is the delivery address for every bag you send from a partner store.</small></div>
        <label className="stacked"><small>HOTEL</small><input value={hotel} onChange={(e) => setHotel(e.target.value)} placeholder="The Annex Hotel" autoFocus /></label>
        <label className="stacked"><small>HOTEL ADDRESS</small><input value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)} placeholder="296 Brunswick Ave" /></label>
        <div className="ownership-note">Trail keeps the address for delivery only. It is never sent to the stores you visit or to the AI.</div>
      </>}

      {step === 3 && <>
        <div className="onboarding-intro"><p>STEP 4 · BUDGET</p><h1>One budget for<br />the whole trip.</h1><small>Trail splits it so the delivery fee is protected before you start spending.</small></div>
        <label className="stacked"><small>CURRENCY</small><select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((option) => <option key={option}>{option}</option>)}</select></label>
        <div className="budget-editor"><div><span><small>TOTAL SHOPPING BUDGET</small><b>{currency} ${total}</b></span></div><input type="range" min="40" max="1000" step="10" value={total} onChange={(e) => setTotal(Number(e.target.value))} /><div className="range-values"><span>40</span><span>1000</span></div></div>
        <section className="bucket-preview">
          <span><i className="planned" /><small>Planned for gifts</small><b>{currency} ${buckets.planned}</b></span>
          <span><i className="reserve" /><small>Protected for delivery</small><b>{currency} ${buckets.reserve}</b><em>{quoted ? `Quoted for ${city.trim()}` : "Trail’s standard rate"}</em></span>
          <span><i className="flex" /><small>Flexible</small><b>{currency} ${buckets.flexible}</b></span>
        </section>
        <div className="ownership-note">Only the planned amount is spendable while you shop. The protected amount is the bag delivery fee Trail quotes for this city — it is not an estimate made on this phone. Moving money out of flexible needs your approval.</div>
      </>}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="onboarding-actions">
        {step > 0 && <button type="button" className="back-to-chat" onClick={() => setStep(step - 1)}>Back</button>}
        {step < STEPS.length - 1
          ? <button type="button" className="main-button" disabled={!canContinue} onClick={() => setStep(step + 1)}><span>Continue<small>{STEPS[step + 1]}</small></span><i>→</i></button>
          : <button type="submit" className="main-button dark" disabled={saving || !canContinue}><span>{saving ? "Saving your trip…" : "Create my trip"}<small>You can change any of this later</small></span><i>✓</i></button>}
      </div>
    </form>
  </main></div>;
}
