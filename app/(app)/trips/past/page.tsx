"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Header } from "@/components/chrome";
import { IconChevronDown, IconChevronUp, IconSpark } from "@/components/icons";
import { pastTrips, useApp } from "../../app-state";

export default function PastTripsPage() {
  const router = useRouter();
  const { setMemoryEnabled, updatePlan, setMessages, notify } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  return <div className="screen profile-screen"><Header title="Past trips" back={() => router.push("/trips")} />
    <div className="profile-section-label history-label"><b>Past trips</b><span>{pastTrips.length} trips remembered</span></div>
    <h1 className="visually-hidden">Past trips</h1>
    <section className="trip-history">{pastTrips.map((item) => <article className={expanded === item.id ? "expanded" : ""} key={item.id}>
      <button aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}><i className={item.color}>{item.city.charAt(0)}</i><span><small>{item.dates}</small><b>{item.city}, {item.country}</b><em>{item.purchases}</em></span><strong>CAD ${item.spend}</strong><b>{expanded === item.id ? <IconChevronUp /> : <IconChevronDown />}</b></button>
      {expanded === item.id && <div><div>{item.areas.map((area) => <span key={area}>{area}</span>)}</div><p><i><IconSpark /></i>{item.insight}</p><button onClick={() => { setMemoryEnabled(true); updatePlan("preference", item.id === "tokyo" ? "Practical and useful" : "Thoughtful and useful"); setMessages((current) => [...current, { role: "ai", text: `${item.city} taste applied: ${item.insight}` }]); notify(`${item.city} taste applied to the current brief`); router.push("/ask"); }}>Use this taste now</button></div>}
    </article>)}</section>
    <div className="offline-note"><b>Sample trip history.</b><span>These two trips are prototype data. Real history arrives with the trips a traveler actually finished.</span></div>
  </div>;
}
