"use client";

/** The memory modal that used to sit on top of the chat. It is a page now, so the
 *  answer to "why does Trail know this" has a URL a traveler can come back to. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header, Toggle } from "@/components/chrome";
import { IconChevronRight, IconSpark } from "@/components/icons";
import { useApp } from "../../app-state";

export default function MemoryPage() {
  const router = useRouter();
  const { memoryEnabled, setMemoryEnabled, notify } = useApp();

  return <div className="screen profile-screen"><Header title="Memory & privacy" back={() => router.push("/trips")} />
    <section className="profile-intro"><div className="profile-mark"><IconSpark /></div><span><p>{memoryEnabled ? "APPROVED TRAVEL MEMORY" : "TRAVEL MEMORY OFF"}</p><h1>Why Trail<br /><em>knows this.</em></h1><small>{memoryEnabled ? "Tokyo 2025 and Copenhagen 2024 show repeated choices: independent makers, useful objects, and packable quality." : "Trail is not reusing past-trip preferences. Current trip details still shape this shopping route."}</small></span></section>
    <section className="preferences"><div><span><b>Use past trips</b><small>Rank gifts and handling from what you chose before</small></span><Toggle label="Use past trips" on={memoryEnabled} onChange={(value) => { setMemoryEnabled(value); notify(value ? "Travel memory enabled" : "Travel memory turned off"); }} /></div></section>
    {memoryEnabled && <section className="ai-memory-card"><header><i><IconSpark /></i><span><small>PATTERNS IN USE</small><b>What I know about you</b></span><em>2 TRIPS</em></header><div><span>Local over generic</span><span>Useful over decorative</span><span>Hands-free when possible</span></div><p>Trail uses approved patterns to rank gifts and handling. You still control every route and transfer.</p></section>}
    <Link className="workflow-link" href="/trips/past"><i><IconSpark /></i><span><b>Review the sources</b><small>The past trips these patterns come from</small></span><em><IconChevronRight /></em></Link>
    <div className="offline-note"><b>Per-item consent is not built yet.</b><span>Today this is one switch. Choosing which trips Trail may read arrives with the account settings work.</span></div>
  </div>;
}
