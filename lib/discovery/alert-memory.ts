/** The only thing N1 writes down, and the one place that writes it.
 *
 *  ── WHAT IS IN IT ───────────────────────────────────────────────────────────────────
 *  `{ alerted: { [storeId]: ISO8601 }, dayKey, dayCount }` and a boolean for the switch.
 *  Steal this whole record and the sentence it yields is *"this person was told about
 *  these shops on this trip"* — never *"this person was at this place at this time"*.
 *  There is no latitude, no longitude, no distance, no walking figure, no dwell and no
 *  visit in it. Not because they are stripped on the way out: because **no function in
 *  this file has a parameter that could carry one**, so the compiler is the guard rather
 *  than a reviewer.
 *
 *  ── WHY IT IS ON THE DEVICE AND NOT ON THE ACCOUNT ──────────────────────────────────
 *  Syncing it would mean a table keyed by user, trip and shop, with times — which is a
 *  proximity log wearing a different name, and would have to be answered for in the
 *  account-deletion cascade (0007), in a subpoena, and in a breach. The cost of keeping it
 *  local is that a second phone hears about a shop a second time. That is the cheaper
 *  mistake and we take it on purpose.
 *
 *  ── NAMESPACE ───────────────────────────────────────────────────────────────────────
 *  `trail:nearby:v1:*`, which cannot collide with `trail-cache-v4/v5:*` (the offline
 *  outbox and the purchase drafts). Nothing here sweeps a prefix — a keyspace sweep is how
 *  a location feature deletes somebody's unsent purchase. */

/** Two hundred shops on one trip is already more than anybody walks past knowingly; the
 *  cap exists so a long trip cannot grow this record without bound. */
export const ALERT_MEMORY_LIMIT = 200;
export const MEMORY_PREFIX = "trail:nearby:v1";
export const ENABLED_KEY = `${MEMORY_PREFIX}:enabled`;
export const memoryKey = (userId: string, tripId: string) => `${MEMORY_PREFIX}:${userId}:${tripId}`;

/** `dayKey` is a calendar date **in the trip's zone**, not the phone's — it is what the
 *  daily cap counts against, and a traveller whose phone is still on home time would
 *  otherwise get a fresh allowance in the middle of a Toronto afternoon. */
export type AlertMemory = { alerted: Record<string, string>; dayKey: string; dayCount: number };
export const EMPTY_MEMORY: AlertMemory = { alerted: {}, dayKey: "", dayCount: 0 };

const store = () => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

/** Anything unreadable is treated as "nothing remembered". A corrupt record must not throw
 *  on a screen the traveller opened to look at their trip, and the worst it can cost is
 *  one repeated alert. */
export function parseMemory(raw: string | null): AlertMemory {
  if (!raw) return EMPTY_MEMORY;
  try {
    const value = JSON.parse(raw) as Partial<AlertMemory>;
    const alerted: Record<string, string> = {};
    for (const [id, at] of Object.entries(value.alerted ?? {})) if (typeof at === "string") alerted[id] = at;
    return { alerted, dayKey: typeof value.dayKey === "string" ? value.dayKey : "", dayCount: Number.isFinite(value.dayCount) ? Number(value.dayCount) : 0 };
  } catch { return EMPTY_MEMORY; }
}

/** Oldest out first. `alerted` is the once-per-trip rule's whole memory, so trimming it
 *  can only ever cost a repeat — never a wrong alert. */
export function trimMemory(memory: AlertMemory, limit = ALERT_MEMORY_LIMIT): AlertMemory {
  const entries = Object.entries(memory.alerted);
  if (entries.length <= limit) return memory;
  const kept = entries.sort((a, b) => a[1].localeCompare(b[1])).slice(entries.length - limit);
  return { ...memory, alerted: Object.fromEntries(kept) };
}

export function readMemory(userId: string, tripId: string): AlertMemory {
  const box = store();
  return box ? parseMemory(box.getItem(memoryKey(userId, tripId))) : EMPTY_MEMORY;
}

export function writeMemory(userId: string, tripId: string, memory: AlertMemory) {
  const box = store();
  try { box?.setItem(memoryKey(userId, tripId), JSON.stringify(trimMemory(memory))); } catch { /* a full quota is not a reason to fail a screen */ }
}

/** `Forget what I've been alerted about` on the settings screen, and the same call the
 *  sign-out and account-deletion paths make. One key, removed by name. */
export function forgetAlerts(userId: string, tripId: string) { try { store()?.removeItem(memoryKey(userId, tripId)); } catch { /* nothing to forget then */ } }

/** Off unless the traveller turned it on. Not a server column: this is a switch on one
 *  device about one radio, and putting it on the account would make it a claim about
 *  phones we cannot see.
 *
 *  Exposed as an external store rather than a `useState` seeded in an effect. The value
 *  lives outside React (it is `localStorage`, and another tab can change it), which is
 *  exactly the case `useSyncExternalStore` exists for — and it keeps the switch off during
 *  the server render, where there is no storage to read and a guess would be a hydration
 *  mismatch about whether a location feature is on. */
export function readAlertsEnabled(): boolean { try { return store()?.getItem(ENABLED_KEY) === "1"; } catch { return false; } }
/** The server has no device, so it has no switch. */
export const alertsDisabled = () => false;

const listeners = new Set<() => void>();
export function subscribeAlertsEnabled(listener: () => void) {
  listeners.add(listener);
  // `storage` fires in the *other* tabs. Turning the feature off on one screen should not
  // leave a second tab of the same app still watching.
  if (typeof window === "undefined") return () => { listeners.delete(listener); };
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

export function writeAlertsEnabled(enabled: boolean) {
  try { if (enabled) store()?.setItem(ENABLED_KEY, "1"); else store()?.removeItem(ENABLED_KEY); } catch { /* the session still works, it just will not be remembered */ }
  for (const listener of listeners) listener();
}
