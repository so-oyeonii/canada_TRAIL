"use client";

/** The traveller's position, held in memory and nowhere else.
 *
 *  Three rules this file exists to keep:
 *
 *  1. `navigator.geolocation` is only ever called from an explicit tap. No effect asks on
 *     mount, so the permission prompt is always something the traveller pressed for.
 *  2. The fix goes in React state and stops there — not localStorage, not the outbox, not
 *     a request body. `GET /api/recommendations` takes a city name.
 *  3. Refused or not asked is a real answer, not a degraded one. `point` stays null and
 *     every distance downstream stays null, so the screen prints the neighbourhood
 *     instead of a walking time it made up. */

import { useCallback, useState } from "react";
import type { Point } from "./distance";

export type NearbyStatus = "idle" | "asking" | "ready" | "denied" | "unavailable";

export function useNearby() {
  const [point, setPoint] = useState<Point | null>(null);
  const [status, setStatus] = useState<NearbyStatus>("idle");

  const ask = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setStatus("unavailable"); return; }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (position) => { setPoint({ lat: position.coords.latitude, lng: position.coords.longitude }); setStatus("ready"); },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 120_000 },
    );
  }, []);

  /** Forgetting is a tap too. Nothing was written down, so this is the whole of it. */
  const forget = useCallback(() => { setPoint(null); setStatus("idle"); }, []);

  return { point, status, ask, forget };
}
