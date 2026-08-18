"use client";

/** `NEAR YOU` — the one place on a screen where the value came from a sensor.
 *
 *  It is a banner in the page flow and not a floating overlay: the sync chip is the single
 *  most important thing this app draws (a write that has not landed says so), and a
 *  proximity notice is not allowed to sit on top of it.
 *
 *  Everything it says was decided in `lib/discovery/*` — pure functions, tested without a
 *  browser. This file chooses no words and computes no distance; it renders four strings
 *  and offers three taps: go and see it, dismiss it, or turn the whole thing off.
 *
 *  **`Turn off nearby alerts` stops the radio, not just the banner.** A switch that
 *  silenced the message while a `watchPosition` kept running would be a lie about which
 *  thing was switched off. */

import Link from "next/link";
import { IconClose, IconPin } from "@/components/icons";
import { useNearbyAlerts } from "@/lib/discovery/use-nearby-alerts";
import type { Recommendation } from "@/lib/state/types";
import { useApp } from "./app-state";
import "@/app/nearby.css";

/** `products` is passed in rather than fetched: the screens that mount this already hold
 *  the recommendation feed, and a second `GET /api/recommendations` for the same city
 *  would be a request made on behalf of a banner that is usually not shown. */
export function NearbyBanner({ products }: { products: readonly Recommendation[] }) {
  const { state, trip, stops, recipients, preferenceTags } = useApp();
  const alerts = useNearbyAlerts({
    userId: state?.user.id ?? "", tripId: trip?.id ?? "", city: trip?.city ?? "", timeZone: trip?.timezone ?? "UTC",
    stops, recipients, products, tags: preferenceTags,
  });
  if (!trip || !alerts.alert) return null;
  const alert = alerts.alert;
  return <aside className="nearby-banner" aria-labelledby="nearby-title">
    <div className="nearby-head"><i><IconPin /></i><small>Near you</small><button type="button" onClick={alerts.dismiss} aria-label="Dismiss this nearby alert"><IconClose /></button></div>
    <b id="nearby-title">{alert.title}</b>
    <p>{alert.body}</p>
    <div className="nearby-actions"><Link href={alert.href} onClick={alerts.dismiss}>{alert.cta}</Link><button type="button" onClick={alerts.turnOff}>Turn off nearby alerts</button></div>
  </aside>;
}
