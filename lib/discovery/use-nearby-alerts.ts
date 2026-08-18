"use client";

/** The wiring. Five pure modules, one banner, and no server at all.
 *
 *  `docs/plans/N1-location-alerts.md` §Q1: **N1 adds zero API routes.** Every judgement
 *  below — is that shop close, has this one been mentioned, is it the middle of the night
 *  where they are, what does the sentence say — happens in this tab, from data the screens
 *  already hold. Nothing is posted, so there is nothing to delete, nothing to leak and
 *  nothing to hand over.
 *
 *  ── WHAT SURVIVES A RELOAD, AND WHAT DOES NOT ───────────────────────────────────────
 *  Survives: the on/off switch, and `{ shopId: when }` — see `alert-memory.ts`.
 *  Does not: the position, the fence state, the distances, the banner. All of it is a
 *  `useRef` or a `useState` that dies with the tab, on purpose.
 *
 *  ── THE SWITCH BEING ON IS NOT PERMISSION TO ASK ────────────────────────────────────
 *  `enabled` is read from the device, so it can be true on a fresh load. That still does
 *  not start a watch: `askForPosition` is only ever reached from a tap, in this session.
 *  A remembered switch means "if a position is granted, alert me" — never "prompt them
 *  again on the way in".
 *
 *  ── THE NOTIFICATION IS THE SMALL HALF (N1-2) ───────────────────────────────────────
 *  The banner is the feature. A local notification is only worth anything in the sliver
 *  where the tab is not focused but the page is still running, so it fires only then —
 *  and never on iOS Safari's normal tabs, where `Notification` is not defined at all. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { showLocalNotification } from "@/app/sw-register";
import type { PreferenceTag } from "../../app/trail-brief.ts";
import { alertCopy, type AlertCopy } from "./alert-copy.ts";
import { EMPTY_MEMORY, alertsDisabled, forgetAlerts, readAlertsEnabled, readMemory, subscribeAlertsEnabled, writeAlertsEnabled, writeMemory, type AlertMemory } from "./alert-memory.ts";
import { decideAlert, recordAlert, type AlertRefusal } from "./alert-policy.ts";
import { EMPTY_FENCE, shouldRecheck, stepFence, type FenceMark, type FenceState } from "./geofence.ts";
import { everySample, fenceTargets, nearbyCandidates, type MatchPerson, type MatchStop } from "./match.ts";
import { useNearby, askForPosition, forgetPosition } from "./nearby.ts";
import type { Recommendation } from "../state/types.ts";

export type NearbyAlertsInput = {
  userId: string;
  tripId: string;
  city: string;
  timeZone: string;
  stops: readonly MatchStop[];
  recipients: readonly MatchPerson[];
  products: readonly Recommendation[];
  tags: readonly PreferenceTag[];
};

export type NearbyAlert = AlertCopy & { storeIds: string[] };

export function useNearbyAlerts(input: NearbyAlertsInput) {
  const nearby = useNearby();
  // Read through an external store, not a `useState` filled in on mount: the value belongs
  // to the device rather than to this component, and the server render has to see `false`.
  const enabled = useSyncExternalStore(subscribeAlertsEnabled, readAlertsEnabled, alertsDisabled);
  const [alert, setAlert] = useState<NearbyAlert | null>(null);
  const [refusal, setRefusal] = useState<AlertRefusal | null>(null);
  const fence = useRef<FenceState>(EMPTY_FENCE);
  const mark = useRef<FenceMark | null>(null);
  const memory = useRef<AlertMemory>(EMPTY_MEMORY);
  // The latest props, without making them effect dependencies: a new `stops` array every
  // render would otherwise re-judge the whole catalogue on every paint.
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });

  useEffect(() => { memory.current = readMemory(input.userId, input.tripId); fence.current = EMPTY_FENCE; mark.current = null; }, [input.userId, input.tripId]);

  useEffect(() => {
    const point = nearby.point;
    if (!enabled || !point) return;
    const now = new Date();
    const at = now.getTime();
    // Seventy-five metres or sixty seconds. `watchPosition` fires far more often than
    // either while standing still, and each one of those would be a full catalogue sweep.
    if (!shouldRecheck(mark.current, point, at)) return;
    mark.current = { point, at };

    const { userId, tripId, city, timeZone, stops, recipients, products, tags } = latest.current;
    const step = stepFence(fence.current, fenceTargets(stops, products), point);
    fence.current = step.inside;
    if (!step.entered.length) return;

    const candidates = nearbyCandidates({ storeIds: step.entered, point, stops, recipients, products, tags });
    const decision = decideAlert({ storeIds: candidates.map((row) => row.storeId), memory: memory.current, now, timeZone, everythingIsSample: everySample(candidates), enabled });
    if (!decision.ok) { setRefusal(decision.reason); return; }

    const named = candidates.filter((row) => decision.storeIds.includes(row.storeId));
    const copy = alertCopy(named, city);
    if (!copy) return;
    memory.current = recordAlert(decision.memory, decision.storeIds, now, timeZone);
    writeMemory(userId, tripId, memory.current);
    setRefusal(null);
    setAlert({ ...copy, storeIds: decision.storeIds });
    // N1-2. Only when the tab is not the one being looked at — otherwise the banner has
    // already said it, and two of the same message is one too many.
    if (typeof document !== "undefined" && !document.hasFocus()) void showLocalNotification({ title: copy.title, body: copy.body, href: copy.href, tag: `nearby:${decision.storeIds.join(",")}` });
  }, [nearby.point, enabled]);

  const dismiss = useCallback(() => setAlert(null), []);
  /** Turning it on is the tap that asks for the position. One gesture, one prompt. */
  const turnOn = useCallback(() => { writeAlertsEnabled(true); askForPosition(); }, []);
  /** And turning it off stops the radio as well as the banner. A switch that left the
   *  watch running would be a switch about notifications pretending to be one about
   *  location. */
  const turnOff = useCallback(() => { writeAlertsEnabled(false); forgetPosition(); setAlert(null); setRefusal(null); }, []);
  const forget = useCallback(() => { const { userId, tripId } = latest.current; forgetAlerts(userId, tripId); memory.current = EMPTY_MEMORY; fence.current = EMPTY_FENCE; }, []);

  return { alert, refusal, enabled, dismiss, turnOn, turnOff, forget, status: nearby.status, hasPosition: nearby.point !== null };
}
