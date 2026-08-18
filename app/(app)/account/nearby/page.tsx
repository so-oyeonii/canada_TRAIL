"use client";

/** `Nearby alerts` — the switch, the limits, and the sentence that keeps this honest.
 *
 *  ── THE SENTENCE ────────────────────────────────────────────────────────────────────
 *  `FOREGROUND_ONLY` is the one thing on this screen that is not optional. The web cannot
 *  watch a position in the background: a service worker has no `navigator.geolocation` in
 *  any browser, the Geofencing API was never shipped by anybody, and iOS stops running the
 *  page the moment it leaves the screen. Every one of those is a fact about the platform
 *  and none of them is fixable by us.
 *
 *  So the screen says it. The worst failure this app has is the quiet one — the write that
 *  looks saved and is not, the alert somebody is waiting for that was never coming. A
 *  feature that under-promises and works is worth more than one that reads well and leaves
 *  a traveller checking their phone in a market for a buzz that cannot arrive.
 *
 *  ── THE LIMITS ARE PRINTED, NOT HIDDEN ──────────────────────────────────────────────
 *  Three a day, two if everything on offer is sample data, twenty minutes apart, and once
 *  per shop for the whole trip. Without those numbers on screen there is no way to tell
 *  "nothing was near you" from "Trail used up today's three" — and the second one, unsaid,
 *  reads as a broken feature.
 *
 *  ── AND WHAT IS NEVER WRITTEN DOWN ──────────────────────────────────────────────────
 *  The list at the bottom is not marketing. It is the same list as
 *  `docs/plans/N1-location-alerts.md` §6, and the reason it can be stated so flatly is
 *  that there is no route to send a coordinate to: N1 added zero API endpoints. */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Header, Toggle } from "@/components/chrome";
import { IconChevronRight, IconPin } from "@/components/icons";
import { FOREGROUND_ONLY } from "@/lib/discovery/alert-copy";
import { COOLDOWN_MS, DAILY_CAP, QUIET_FROM_HOUR, QUIET_UNTIL_HOUR, SAMPLE_DAILY_CAP, refusalCopy } from "@/lib/discovery/alert-policy";
import { ENTER_METRES } from "@/lib/discovery/geofence";
import { useNearbyAlerts } from "@/lib/discovery/use-nearby-alerts";
import { askNotificationPermission, notificationPermission, notificationPermissionOnServer, subscribeNotificationPermission } from "@/app/sw-register";
import { useApp } from "../../app-state";
import "@/app/nearby.css";

const clock = (hour: number) => (hour === 0 ? "midnight" : hour < 12 ? `${hour}am` : hour === 12 ? "noon" : `${hour - 12}pm`);

export default function NearbyAlertsPage() {
  const router = useRouter();
  const { state, trip, stops, recipients, preferenceTags, notify } = useApp();
  // No feed on this screen on purpose: the switch is about whether alerts may happen at
  // all, and fetching a city catalogue to draw a toggle would be a request for nothing.
  const alerts = useNearbyAlerts({ userId: state?.user.id ?? "", tripId: trip?.id ?? "", city: trip?.city ?? "", timeZone: trip?.timezone ?? "UTC", stops, recipients, products: [], tags: preferenceTags });
  const permission = useSyncExternalStore(subscribeNotificationPermission, notificationPermission, notificationPermissionOnServer);

  const ask = async () => {
    const answer = await askNotificationPermission();
    notify(answer === "granted" ? "Notifications on — while Trail is open" : answer === "denied" ? "Your browser refused notifications. The in-app banner still works." : "This browser cannot show notifications here.");
  };

  return <div className="screen profile-screen"><Header title="Nearby alerts" back={() => router.push("/account/memory")} />

    <section className="profile-intro"><div className="profile-mark"><IconPin /></div><span><p>{alerts.enabled ? "NEARBY ALERTS ON" : "NEARBY ALERTS OFF"}</p><h1>What&rsquo;s near you,<br /><em>while Trail is open.</em></h1><small>{FOREGROUND_ONLY}</small></span></section>

    <section className="preferences"><div><span><b>Tell me what&rsquo;s nearby</b><small>Uses your position on this device. It is never sent to Trail.</small></span><Toggle label="Nearby alerts" on={alerts.enabled} onChange={(value) => { if (value) alerts.turnOn(); else alerts.turnOff(); }} /></div></section>

    {alerts.enabled && <p className="nearby-note">{alerts.hasPosition ? "Trail is reading your position on this screen. It stops the moment you switch away, and it is not written down anywhere." : "Trail is not reading your position yet. It asks the first time you tap for walking times, and only then."}</p>}
    {alerts.refusal && <p className="nearby-note">{refusalCopy[alerts.refusal]}</p>}

    <div className="profile-section-label"><b>The limits</b><span>Why it stays quiet</span></div>
    <ul className="nearby-limits">
      <li><span>A day</span><b>{DAILY_CAP}, or {SAMPLE_DAILY_CAP} while the shop list is sample data</b></li>
      <li><span>Between alerts</span><b>{COOLDOWN_MS / 60_000} minutes</b></li>
      <li><span>The same shop</span><b>Once for the whole trip</b></li>
      <li><span>How close</span><b>About {ENTER_METRES} m — a few minutes&rsquo; walk</b></li>
      <li><span>Quiet hours</span><b>{clock(QUIET_FROM_HOUR)} to {clock(QUIET_UNTIL_HOUR)} where you are</b></li>
    </ul>

    <div className="profile-section-label"><b>Notifications</b><span>The small half</span></div>
    {/* Feature-detected rather than assumed: `window.Notification` does not exist in a
        normal iOS Safari tab, only in a web app added to the Home Screen. And the prompt
        is behind this button — never on the way into a screen. */}
    <p className="nearby-note">{permission === "unsupported"
      ? "This browser cannot show Trail notifications. On iPhone, add Trail to your Home Screen first — in an ordinary Safari tab there is nothing to switch on. The in-app banner works either way."
      : permission === "granted"
        ? "Notifications are on. They can still only arrive while Trail is running — if you have switched apps, the banner will be waiting when you come back."
        : permission === "denied"
          ? "Your browser is refusing notifications for Trail. That is changed in browser settings, not here. The in-app banner is unaffected."
          : "Trail can also raise a notification when you are looking at another tab. It cannot raise one after you close Trail."}</p>
    {permission === "default" && <button type="button" className="back-to-chat" onClick={() => void ask()}>Allow notifications</button>}

    <div className="profile-section-label"><b>What Trail keeps</b><span>On this device only</span></div>
    <p className="nearby-note">One line per shop you have been told about, so the same shop is not mentioned twice on one trip. It holds shop names and times, and nothing else.</p>
    <button type="button" className="back-to-chat" onClick={() => { alerts.forget(); notify("Trail forgot which shops it has mentioned"); }}>Forget what I&rsquo;ve been alerted about</button>

    <div className="profile-section-label"><b>What Trail never keeps</b><span>Not a setting — there is no route to send it to</span></div>
    <ul className="nearby-never">
      <li>Your coordinates. Not on the server, not in this browser&rsquo;s storage, not in a request.</li>
      <li>Anything worked out from them — distances, walking times, where you have been.</li>
      <li>Which shops you actually walked into. Being told about a place is not visiting it.</li>
      <li>Your position in a share link, or in anything Trail sends to the AI.</li>
    </ul>

    <Link className="workflow-link" href="/account/memory"><i><IconPin /></i><span><b>Memory &amp; privacy</b><small>What Trail remembers across trips</small></span><em><IconChevronRight /></em></Link>
  </div>;
}
