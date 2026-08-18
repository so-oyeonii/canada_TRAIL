"use client";

/** Every screen's data: read from `GET /api/state`, written through the outbox.
 *
 *  What left with T3-B — `initialTrip`, a Toronto trip hard-coded into the client
 *  that made a Paris trip render as Toronto one screen later; the sample
 *  `catalog` the route was built from; `DELIVERY_FEE = 9`, a fee the database has
 *  never charged; and the `Record<id, …>` maps that stood in for rows. Stops, the
 *  wallet, the transfer and the delivery fee all come from the server now, and
 *  nothing in here recomputes any of them.
 *
 *  Writes are optimistic and queued, because the shop is underground and a failed
 *  write is a normal path: `drafts` holds what the traveler just did over the
 *  server's answer until the op leaves the outbox, `queued` says so on screen the
 *  whole time it is there, and a refused op surfaces instead of being retried
 *  into silence. */

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Brand } from "@/components/chrome";
import { PREFERENCE_TAGS, type BriefField, type Plan as Brief, type PlanKey, type PlanPatch, type PreferenceTag, type RouteTag } from "@/app/trail-brief";
import { TAGS_HANDOFF_KEY } from "@/app/onboarding/trip-draft";
import { forgetAlerts } from "@/lib/discovery/alert-memory";
import { fromMinor } from "@/lib/money/format";
import type { OutboxMethod, OutboxOp } from "@/lib/state/outbox";
import { boughtStops, draftItems, deliveryStep as stepFromEvents, routeStops, selectedBagCount as countBags } from "@/lib/state/selectors";
import { computeWallet } from "@/lib/state/shape";
import { EMPTY_WALLET, type DraftItem, type DropoffPoint, type Handling, type IssueKind, type ItemKey, type Purchase, type Stop, type StopId, type StopStatus, type TrailState } from "@/lib/state/types";
import { useTrailState } from "@/lib/state/use-trail-state";
import { type CachedPass, readPass, shouldReissue, writePass } from "@/lib/transfers/pass-cache";
import type { Eligibility } from "@/lib/transfers/eligibility";

export type Message = { role: "ai" | "user"; text: string };
export type Quote = { feeCents: number; currency: string; includedBags: number; extraBags: number };
export type PurchaseDraft = { actualPriceCents: number; quantity: number; bags: number; handling: Handling };
export type WriteFailure = { path: string; status: number; error: string; detail: Record<string, unknown> };
export type Reply = { ok: boolean; status: number; data: Record<string, unknown> };
/** What a recipient form sends. Every field is optional on a PATCH, and the
 *  route is what refuses a bad one — the screen does not pre-judge it. */
export type RecipientDraft = { name?: string; relationship?: string; groupSize?: number; priority?: number; isSelf?: boolean; isOptional?: boolean; preferenceNote?: string; equalValueGroup?: string | null };
/** One person's slice. `basis` is what decides whether the amount is per head or
 *  the whole group's — a team of twelve at 39 each is not 39. */
export type AllocationEntry = { recipientId: string; amountCents: number; basis?: "per_person" | "group_total"; bucket?: "planned" | "flexible" };
/** Every column of `trips` writable under a traveller's session. 0020 and 0021 enforce the
 *  same list as column GRANTs. If the two ever drift the database answers 42501 and the
 *  traveller sees a save fail for a reason nothing on screen can explain — so they are
 *  changed together, and `tests/trail-trip-grants.test.ts` compares them. `status`,
 *  `currency`, `hotel_verified_at` and `provisional_until` are absent on purpose: a
 *  lifecycle, the meaning of every stored cent, a fact the hotel gave us, and a piece of
 *  server bookkeeping.
 *
 *  `timezone` is granted (0021) but never sent from a form: `PATCH /api/trips/{id}` derives
 *  it from the city, on the server, under the traveller's own session — which is why the
 *  grant has to exist at all. */
export const TRIP_WRITABLE = ["country", "city", "areas", "start_date", "end_date", "hotel_name", "hotel_address", "companions", "free_time", "timezone"] as const;
export type TripPatch = Partial<Record<(typeof TRIP_WRITABLE)[number], unknown>>;
/** What a screen may put in a `PATCH /api/trips/{id}` body. camelCase, and a strict subset:
 *  the fields the server owns are refused by name rather than silently dropped. */
export type TripEdit = Partial<{ country: string; city: string; areas: string[]; startDate: string | null; endDate: string | null; hotelName: string; hotelAddress: string; companions: string; freeTime: string }>;

/** Three fixed rows, and not one of them is a stored payment method — there is no
 *  PSP, no vault and no token, so a "saved cards" list would be a list of cards that
 *  do not exist. `Apple Pay` carries no logo (the mark is licensed for real support
 *  only) and `4242` is gone: it is a Stripe test number, and printing it claims a
 *  card Trail has never seen. What a tap here actually records is `payments.method_brand`. */
export const payMethods = [{ id: "apple", label: "Apple Pay (simulated)", detail: "No card details are taken", mark: "" }, { id: "visa", label: "Sample card", detail: "Nothing is stored — Trail has never seen a card number", mark: "S" }, { id: "other", label: "Another card", detail: "Add at the partner point", mark: "+" }];
/** `href` instead of `prompt` means the tap opens a screen rather than spending a turn.
 *  `I've got an hour spare` is answered entirely by the catalogue, the walk and the
 *  drop-off cut-off, so sending it to the model would buy a round trip and a chance to
 *  hallucinate in exchange for nothing. */
export const starters: { icon: string; title: string; prompt: string; href?: string }[] = [
  { icon: "M", title: "A gift for my mom", prompt: "I want a thoughtful local gift for my mom under CAD 80." },
  { icon: "F", title: "Two equal gifts", prompt: "I need two different but equal-value gifts for my friends." },
  { icon: "T", title: "Treats for my team", prompt: "I need something easy to share with my 12-person lab team." },
  { icon: "H", title: "I've got an hour spare", prompt: "Show me what fits the time I have left.", href: "/trail/spare" },
];
export const initialBrief: Brief = { recipient: "My mom", quantity: 1, category: "Home & design", budget: 80, preference: "Thoughtful and useful", localOnly: true, easyPack: true, hotelDelivery: true };
/** The opening line, with the city in it. Written by the client, not by a model turn: it costs a
 *  round trip to say hello, and a greeting that can hallucinate is a greeting that can name a shop. */
export const greeting = (city: string): Message => ({ role: "ai", text: `Let’s build your ${city} shopping day. I’ll help you find meaningful local gifts, stay within your budget, optimize your route, and get your bags back to your hotel.` });

/** Whatever onboarding carried over, or nothing. Guarded for the server render, where there is no
 *  sessionStorage — and where nothing reads these anyway, because the provider is still booting. */
function carriedTags(): { preferenceTags?: PreferenceTag[] } {
  if (typeof window === "undefined") return {};
  try {
    const carried = sessionStorage.getItem(TAGS_HANDOFF_KEY);
    if (!carried) return {};
    const tags = (JSON.parse(carried) as unknown[]).filter((tag): tag is PreferenceTag => typeof tag === "string" && (PREFERENCE_TAGS as readonly string[]).includes(tag));
    return tags.length ? { preferenceTags: tags } : {};
  } catch { return {}; }
}

/** A write the traveler has made and the server has not confirmed. Keyed by stop
 *  id and dropped the moment its op leaves the outbox — never merged into state,
 *  so the server's answer always wins the next paint. */
type Draft = { ops: string[]; at: string; purchase?: PurchaseDraft | null; saved?: boolean; status?: StopStatus };

/** Online/offline as an external store: reading it during render is what keeps
 *  the sync chip honest without a setState inside an effect. */
const subscribeNetwork = (onChange: () => void) => { window.addEventListener("online", onChange); window.addEventListener("offline", onChange); return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); }; };

const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const isStoredKey = (key: ItemKey) => !key.startsWith("pending:");

function patchStop(stop: Stop, draft: Draft | undefined): Stop {
  if (!draft) return stop;
  const status = draft.status ?? (draft.purchase ? "bought" : draft.purchase === null ? "planned" : stop.status);
  const purchase: Purchase | null = draft.purchase === undefined ? stop.purchase
    : draft.purchase === null ? null
    : { id: stop.purchase?.id ?? `pending:${stop.id}`, stopId: stop.id, currency: stop.purchase?.currency ?? "CAD", note: null, unplannedLabel: null, clientKey: null, recordedAt: draft.at, voidedAt: null, voidReason: null, ...draft.purchase };
  return { ...stop, saved: draft.saved ?? stop.saved, status, purchase };
}

/** The state the screens read: the server's, with unflushed writes laid over it.
 *  The wallet is recomputed by the same function the server uses, so an
 *  optimistic total can never be arrived at a different way than the real one. */
export function withDrafts(state: TrailState, drafts: Record<string, Draft>): TrailState {
  if (!Object.keys(drafts).length) return state;
  const stops = state.stops.map((stop) => patchStop(stop, drafts[stop.id]));
  return { ...state, stops, wallet: computeWallet(state.plan, stops, state.unplannedPurchases) };
}

export type AppValue = ReturnType<typeof useAppState>;
/** The trip-scoped contract. `trip` is non-null, which is what nine screens are written
 *  against — and none of them may invent one when it is missing. */
export type AppReady = AppValue & { trip: NonNullable<AppValue["trip"]> };
const AppContext = createContext<AppValue | null>(null);

/** For the screens that exist without a trip: Home and `My Trips`. A traveller between
 *  trips still has an app. */
export function useApp(): AppValue { const value = useContext(AppContext); if (!value) throw new Error("useApp called outside AppProvider"); return value; }

/** For everything under `/trail/*`, `/bags/*` and `/ask/*`. `<TripGate>` is what keeps a
 *  traveller out of those without a trip, so this throw is a routing bug rather than
 *  something a traveller can reach — and it is a throw rather than an empty state because
 *  an empty delivery screen is indistinguishable from a delivery that disappeared. */
export function useTrip(): AppReady {
  const value = useApp();
  if (!value.trip) throw new Error("useTrip called outside <TripGate>");
  return value as AppReady;
}

function useAppState() {
  const trail = useTrailState();
  const { status, error, fromCache, queued, syncedAt, refresh, queue, flush, pending, selectTrip } = trail;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [picked, setPicked] = useState<{ transferId: string | null; map: Record<ItemKey, boolean> } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [points, setPoints] = useState<DropoffPoint[]>([]);
  const [partnerCount, setPartnerCount] = useState<number | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [failure, setFailure] = useState<WriteFailure | null>(null);
  const [paymentRef, setPaymentRef] = useState("");
  const [pass, setPass] = useState<CachedPass | null>(null);
  const [passError, setPassError] = useState("");
  const [pricingSource, setPricingSource] = useState<"table" | "fallback" | null>(null);
  const [briefEdits, setBriefEdits] = useState<Partial<Brief>>({});
  /** The closed-enum half of the brief. Separate from `briefEdits` because the flat `Brief` is the
   *  legacy one-recipient projection and has two booleans where this has eight tags. Draft-only,
   *  exactly like `briefEdits`: `plans` refuses a browser write since 0013, and the route that can
   *  write these (`PATCH /api/plans/{id}/brief`) needs migration 0025 applied first. */
  const [tagEdits, setTagEdits] = useState<{ preferenceTags?: PreferenceTag[]; routeTag?: RouteTag | null }>(carriedTags);
  const [approvedByTap, setApprovedByTap] = useState<Brief | null>(null);
  const [routeDirty, setRouteDirty] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [suggestion, setSuggestion] = useState<PlanPatch | null>(null);
  const [memoryOverride, setMemoryOverride] = useState<boolean | null>(null);
  const [toast, setToast] = useState("");
  const offline = !useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); }, []);

  const view = useMemo(() => (trail.state ? withDrafts(trail.state, drafts) : null), [trail.state, drafts]);
  const trip = view?.trip ?? null;
  // The list outlives a trip that has not loaded: `My Trips` is drawable from the cached
  // index alone, which is what makes switching trips work on a platform with no signal.
  const trips = view?.trips ?? trail.trips;
  const serverPlan = view?.plan ?? null;
  const wallet = view?.wallet ?? EMPTY_WALLET;
  const stops = useMemo(() => (view ? routeStops(view) : []), [view]);
  const bought = useMemo(() => (view ? boughtStops(view) : []), [view]);
  const transfer = view?.transfer ?? null;
  const currency = trip?.currency ?? "CAD";
  const tripId = trip?.id ?? null;

  // The picker is per transfer: a selection made for a delivery that has since
  // been confirmed or cancelled is not a selection for the next one.
  const selection = picked && picked.transferId === (transfer?.id ?? null) ? picked.map : null;
  const items: DraftItem[] = useMemo(() => {
    const rows = view ? draftItems(view) : [];
    // A bag whose purchase is still in the outbox cannot be on a manifest the
    // server has no id for, so it is never counted as selected.
    return rows.map((row) => ({ ...row, selected: isStoredKey(row.key) && (selection ? Boolean(selection[row.key]) : transfer ? row.selected : true) }));
  }, [view, selection, transfer]);
  const selectedItems = useMemo(() => items.filter((item) => item.selected), [items]);
  const selectedBagCount = countBags(items);
  const bagCount = items.reduce((sum, item) => sum + item.bags, 0);
  const deliveryStep = stepFromEvents(transfer?.events ?? []);
  const shoppingStarted = stops.some((stop) => stop.status !== "planned");
  /** How much of today is left to buy. Undefined until `stops.planned_date` is
   *  populated (0024): with no dated stop nobody knows what "today" holds, and that
   *  is not the same as knowing it is empty. The device's date, not the server's —
   *  the traveller is the one standing in the city. */
  const todayStopCount = useMemo(() => { const dated = stops.filter((stop) => stop.plannedDate); if (!dated.length) return undefined; const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; return dated.filter((stop) => stop.plannedDate === today && stop.status === "planned").length; }, [stops]);
  /** Seeded from the plan the server holds, then whatever the traveler has since
   *  typed. Derived, not copied into state: a traveler who set CAD 250 in
   *  onboarding never sees the CAD 80 a constant used to put here. */
  const brief: Brief = useMemo(() => ({ ...initialBrief, ...(serverPlan ? { budget: Math.round(fromMinor(serverPlan.plannedCents, trip?.currency ?? "CAD")), category: serverPlan.category || initialBrief.category, preference: serverPlan.preference || initialBrief.preference, localOnly: serverPlan.localOnly, easyPack: serverPlan.easyPack, hotelDelivery: serverPlan.hotelDelivery } : {}), ...briefEdits }), [serverPlan, briefEdits, trip]);
  const preferenceTags = tagEdits.preferenceTags ?? serverPlan?.preferenceTags ?? [];
  const routeTag = tagEdits.routeTag !== undefined ? tagEdits.routeTag : serverPlan?.routeTag ?? null;
  const approvedBrief = approvedByTap ?? (serverPlan?.status === "approved" ? brief : null);
  const activeBrief = approvedBrief ?? brief;
  const estimates = useMemo(() => { const count = stops.length || (brief.budget < 60 ? 1 : brief.budget < 130 ? 2 : 3); return { stops: count, minutes: 35 + count * 22 }; }, [brief.budget, stops.length]);
  const memoryEnabled = memoryOverride ?? view?.user.memoryEnabled ?? false;
  const hydrated = status !== "idle" && status !== "loading";

  // The preferences answered during onboarding. `POST /api/trips` has no column for them and
  // `plans` refuses a browser write, so they travel across the redirect and land here as a draft,
  // never shown as saved. Read in the initialiser rather than in an effect: an effect that calls
  // setState is a second render for a value that was already known on the first.
  useEffect(() => { try { sessionStorage.removeItem(TAGS_HANDOFF_KEY); } catch { /* private mode */ } }, []);

  // Reconnecting is the one moment worth retrying on its own: everything the
  // traveler recorded underground goes up without them pressing anything.
  useEffect(() => { const back = () => void flush(); window.addEventListener("online", back); return () => window.removeEventListener("online", back); }, [flush]);

  /** A draft outlives its op by exactly nothing. Called after every flush, so the
   *  server's answer is what is on screen the moment it exists. */
  const settle = useCallback(() => {
    const live = new Set(pending().map((op: OutboxOp) => op.opId));
    setDrafts((current) => { const next = Object.fromEntries(Object.entries(current).filter(([, entry]) => entry.ops.some((id) => live.has(id)))); return Object.keys(next).length === Object.keys(current).length ? current : next; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued]);

  const call = useCallback(async (method: OutboxMethod | "GET", path: string, body?: unknown): Promise<Reply> => {
    try {
      const res = await fetch(path, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, status: res.status, data };
    } catch { return { ok: false, status: 0, data: {} }; }   // status 0 is offline; the network store already says so
  }, []);

  /** Queue, then try to send. A refused op is dropped and reported; an op that
   *  cannot leave the phone stays queued and the sync chip says how many. */
  const commit = useCallback(async (method: OutboxMethod, path: string, body: unknown, opId: string): Promise<Reply> => {
    queue(method, path, body, opId);
    const { dropped } = await flush();
    settle();
    const refused = dropped.find((entry) => entry.op.opId === opId);
    if (!refused) return { ok: true, status: 202, data: {} };
    const detail = (refused.body ?? {}) as Record<string, unknown>;
    setFailure({ path, status: refused.status, error: String(detail.error ?? "write_failed"), detail });
    return { ok: false, status: refused.status, data: detail };
  }, [flush, queue, settle]);

  const draft = useCallback((stopId: StopId, opId: string, patch: Omit<Draft, "ops" | "at">) => setDrafts((current) => ({ ...current, [stopId]: { ...current[stopId], ...patch, at: new Date().toISOString(), ops: [...(current[stopId]?.ops ?? []), opId] } })), []);

  // ── writes ────────────────────────────────────────────────
  const savePurchase = useCallback(async (stopId: StopId, purchase: PurchaseDraft) => {
    const opId = uuid();
    draft(stopId, opId, { purchase, status: "bought" });
    return commit("PUT", `/api/purchases/${stopId}`, { ...purchase, status: "bought", currency, occurredAt: new Date().toISOString(), clientOpId: opId }, opId);
  }, [commit, currency, draft]);

  const removePurchase = useCallback(async (stopId: StopId) => {
    const opId = uuid();
    draft(stopId, opId, { purchase: null, status: "planned" });
    return commit("DELETE", `/api/purchases/${stopId}`, { reason: "removed_by_traveler" }, opId);
  }, [commit, draft]);

  const setStopStatus = useCallback(async (stopId: StopId, next: Exclude<StopStatus, "bought">) => {
    const opId = uuid();
    draft(stopId, opId, { status: next });
    return commit("PATCH", `/api/stops/${stopId}`, { status: next, clientOpId: opId }, opId);
  }, [commit, draft]);

  const toggleSaved = useCallback(async (stopId: StopId) => {
    const stop = stops.find((entry) => entry.id === stopId); if (!stop) return;
    const opId = uuid(), next = !stop.saved;
    draft(stopId, opId, { saved: next });
    notify(next ? "Stop saved to your route" : "Stop removed from your route");
    return commit("PATCH", `/api/stops/${stopId}`, { saved: next, clientOpId: opId }, opId);
  }, [commit, draft, notify, stops]);

  const toggleItem = useCallback((key: ItemKey) => setPicked((current) => { const same = current && current.transferId === (transfer?.id ?? null); const base = same ? current.map : Object.fromEntries(items.map((item) => [item.key, item.selected])); return { transferId: transfer?.id ?? null, map: { ...base, [key]: !base[key] } }; }), [items, transfer]);

  /** The counters in this city, with the cutoff already an instant and the fee
   *  already quoted. No screen prices a delivery itself. */
  const loadDropoffPoints = useCallback(async (bags = 1) => {
    if (!tripId) return;
    const reply = await call("GET", `/api/dropoff-points?tripId=${tripId}&bags=${Math.max(1, bags)}`);
    if (!reply.ok) return;
    setPoints((reply.data.points ?? []) as DropoffPoint[]);
    setPartnerCount(Number(reply.data.partnerCount ?? 0));
    if (reply.data.quote) setQuote(reply.data.quote as Quote);
    // A fallback price is our constant, not the city's partner table. The screen has to be able to say so.
    setPricingSource(reply.data.pricingSource === "table" ? "table" : reply.data.pricingSource === "fallback" ? "fallback" : null);
  }, [call, tripId]);


  // ── recipients, allocations, and the tap that moves money ─
  /** None of these go through the outbox. An allocation that is over the bucket
   *  comes back as a *proposal*, and a proposal the traveller never saw because
   *  it was queued in a basement is the approval gate failing quietly. They are
   *  sent, and their answer is what the screen renders. */
  const recipients = view?.recipients ?? [];
  const budgetChanges = view?.budgetChanges ?? [];
  const pendingBudgetChange = view?.pendingBudgetChange ?? null;
  const planId = serverPlan?.id ?? null;

  const report = useCallback((path: string, reply: Reply) => { if (!reply.ok) setFailure({ path, status: reply.status, error: String(reply.data.error ?? "write_failed"), detail: reply.data }); return reply; }, []);

  const addRecipient = useCallback(async (fields: RecipientDraft) => {
    const reply = await call("POST", "/api/recipients", { ...(tripId ? { tripId } : {}), ...fields });
    if (reply.ok) await refresh();
    return report("/api/recipients", reply);
  }, [call, refresh, report, tripId]);

  const updateRecipient = useCallback(async (id: string, patch: RecipientDraft) => {
    const reply = await call("PATCH", `/api/recipients/${id}`, patch);
    if (reply.ok) await refresh();
    return report(`/api/recipients/${id}`, reply);
  }, [call, refresh, report]);

  /** Archived, never deleted: the person is attached to stops and to purchases
   *  that already happened. Their allocation goes with them. */
  const archiveRecipient = useCallback(async (id: string) => {
    const reply = await call("DELETE", `/api/recipients/${id}`, {});
    if (reply.ok) await refresh();
    return report(`/api/recipients/${id}`, reply);
  }, [call, refresh, report]);

  /** The whole split, replaced in one write. A 409 is not an error to show as a
   *  failure — `exceeds_planned` carries the proposal body the approval screen
   *  posts next, and `equal_value_conflict` names who disagreed. */
  const saveAllocations = useCallback(async (entries: AllocationEntry[], reason?: string) => {
    if (!planId) return { ok: false, status: 0, data: {} } as Reply;
    const reply = await call("PUT", `/api/plans/${planId}/allocations`, { allocations: entries, reason: reason ?? "", clientOpId: uuid() });
    if (reply.ok) await refresh();
    else if (reply.status !== 409) report(`/api/plans/${planId}/allocations`, reply);
    return reply;
  }, [call, planId, refresh, report]);

  /** A whole chat turn's worth of recipient work, in one request. `POST /api/recipients/apply`
   *  adds, updates and re-splits inside one transaction and merges the result with the
   *  allocations of everyone the turn never mentioned — sending the ops one at a time would drop
   *  every untouched slice, because the allocations route is a whole-list replacement.
   *
   *  `refs` is sent explicitly (`{ r1: uuid }`) so the server resolves refs from the same map the
   *  client built, rather than re-deriving creation order a third time. A 409 is not reported as a
   *  failure: `exceeds_planned` carries the proposal the traveller taps, and `plan_approved` means
   *  the whole turn is waiting for one. */
  const applyRecipientOps = useCallback(async (ops: unknown[], refs: Record<string, string>) => {
    if (!ops.length) return { ok: true, status: 200, data: {} } as Reply;
    const reply = await call("POST", "/api/recipients/apply", { ...(tripId ? { tripId } : {}), ops, refs });
    if (reply.ok) await refresh();
    else if (reply.status !== 409) report("/api/recipients/apply", reply);
    return reply;
  }, [call, refresh, report, tripId]);

  const proposeBudgetChange = useCallback(async (proposal: Record<string, unknown>) => {
    const reply = await call("POST", "/api/budget-changes", { ...(planId ? { planId } : {}), clientOpId: uuid(), ...proposal });
    if (reply.ok) await refresh();
    return report("/api/budget-changes", reply);
  }, [call, planId, refresh, report]);

  /** The tap itself. Since 0013 the plan tables refuse a browser write, so this
   *  is the only way the numbers move — and a 503 here means the server has no
   *  service key, not that the traveller's approval was recorded. */
  const decideBudgetChange = useCallback(async (id: string, decision: "approve" | "reject", reason?: string) => {
    const reply = await call("POST", `/api/budget-changes/${id}/${decision}`, decision === "reject" ? { reason: reason ?? "" } : {});
    if (reply.ok) { await refresh(); notify(decision === "approve" ? "Budget change approved" : "Budget change declined"); }
    return report(`/api/budget-changes/${id}/${decision}`, reply);
  }, [call, notify, refresh, report]);

  /** Opening the delivery. There is one unconfirmed transfer per trip, so this is
   *  safe to press twice, and it answers with the verdict as well as the draft. */
  const openTransfer = useCallback(async (dropoffStoreId?: string | null) => {
    if (!tripId) return { ok: false, status: 0, data: {} } as Reply;
    const reply = await call("POST", "/api/transfers", { tripId, ...(dropoffStoreId ? { dropoffStoreId } : {}) });
    if (reply.data.eligibility) setEligibility(reply.data.eligibility as Eligibility);
    if (reply.data.quote) setQuote(reply.data.quote as Quote);
    if (reply.ok) await refresh();
    return reply;
  }, [call, refresh, tripId]);

  const saveManifest = useCallback(async (transferId: string) => {
    const opId = uuid();
    const body = { items: selectedItems.filter((item) => isStoredKey(item.key)).map((item) => (item.purchaseId ? { purchaseId: item.purchaseId, label: item.label, weightGrams: item.weightGrams } : { id: item.key, label: item.label, bags: item.bags, handling: item.handling, weightGrams: item.weightGrams })) };
    const reply = await commit("PUT", `/api/transfers/${transferId}/items`, body, opId);
    if (reply.ok) await openTransfer();          // re-judges the manifest and re-quotes the fee
    return reply;
  }, [commit, openTransfer, selectedItems]);

  const confirmTransfer = useCallback(async (transferId: string, approveFlexible = false) => {
    const opId = uuid();
    const reply = await commit("POST", `/api/transfers/${transferId}/confirm`, { approveFlexible, clientOpId: opId }, opId);
    if (!reply.ok && reply.data.code) setEligibility({ eligible: false, code: reply.data.code as Eligibility["code"], detail: String(reply.data.detail ?? ""), remedies: (reply.data.remedies ?? []) as Eligibility["remedies"] });
    if (reply.ok) setEligibility(null);
    return reply;
  }, [commit]);

  const reportEvent = useCallback(async (transferId: string, type: "dropped_off" | "delayed" | "seal_issue" | "cancelled", note?: string) => {
    const opId = uuid();
    return commit("POST", `/api/transfers/${transferId}/events`, { type, note: note ?? null, occurredAt: new Date().toISOString(), clientEventId: opId }, opId);
  }, [commit]);

  const reportIssue = useCallback(async (transferId: string, kind: IssueKind, description: string) => {
    const opId = uuid();
    return commit("POST", `/api/transfers/${transferId}/issues`, { kind, description, clientOpId: opId }, opId);
  }, [commit]);

  /** The drop-off pass. Never queued: issuing needs the server, so an outbox entry
   *  would tell a traveller in a basement that their pass is "waiting to save" when
   *  no pass exists at all. Offline with a cached token is the normal path and
   *  answers ok; offline with nothing is a refusal the screen has to draw.
   *
   *  Every POST mints a new token and bumps `pass_version`, which revokes the last
   *  QR — so this only calls out when there is nothing cached or what is cached will
   *  not outlast the queue. */
  const issuePass = useCallback(async (transferId: string, force = false) => {
    const cached = readPass(transferId);
    setPass(cached);
    const now = new Date();
    if (!force && cached && !shouldReissue(cached, now)) { setPassError(""); return { ok: true, status: 200, pass: cached, reissued: false }; }
    if (typeof navigator !== "undefined" && !navigator.onLine) { setPassError(cached ? "" : "offline"); return { ok: Boolean(cached), status: 0, pass: cached, reissued: false }; }
    const reply = await call("POST", `/api/transfers/${transferId}/pass`);
    if (!reply.ok || typeof reply.data.token !== "string") { setPassError(cached ? "" : String(reply.data.error ?? (reply.status === 0 ? "offline" : "pass_unavailable"))); return { ok: Boolean(cached), status: reply.status, pass: cached, reissued: false }; }
    const next: CachedPass = { token: reply.data.token, issuedAt: String(reply.data.issuedAt ?? now.toISOString()), expiresAt: String(reply.data.expiresAt ?? now.toISOString()), version: Number(reply.data.version ?? 1), referenceCode: String(reply.data.referenceCode ?? ""), bagCount: Number(reply.data.bagCount ?? 0) };
    writePass(transferId, next); setPass(next); setPassError("");
    return { ok: true, status: reply.status, pass: next, reissued: Boolean(cached && cached.token !== next.token) };
  }, [call]);

  const advanceSimulation = useCallback(async (transferId: string, fail?: "tag_mismatch" | "front_desk_refused") => {
    const reply = await call("POST", `/api/transfers/${transferId}/simulate`, fail ? { fail } : {});
    if (reply.ok) await refresh();
    return reply;
  }, [call, refresh]);

  /** Editing a trip goes through `PATCH /api/trips/{id}` now. It used to call supabase-js
   *  from here, which stopped being viable the moment 0020 replaced the blanket UPDATE with
   *  a column GRANT: a refused field came back as `42501: permission denied for column
   *  trips.currency`, and that is not an answer to hand someone standing in a hotel lobby.
   *  The route names every refusal, and it is also where `timezone` follows the city.
   *
   *  Still not queued — a hotel changed underground is reported as failed rather than
   *  pretended into the cache. */
  const saveTrip = useCallback(async (edit: TripEdit, id: string | null = null) => {
    const target = id ?? tripId;
    if (!target) return { ok: false, message: "No trip open." };
    const reply = await call("PATCH", `/api/trips/${target}`, edit);
    if (reply.ok) { await refresh(); return { ok: true, message: "" }; }
    const named: Record<string, string> = {
      currency_locked: "A trip's currency is fixed when it is created — every amount already saved is stored in it.",
      status_is_derived: "Trail decides whether a trip is current or past from its dates.",
      server_owned_field: "Trail keeps that field itself.",
      field_not_writable: "Trail cannot change that on this trip.",
      unknown_timezone: "Trail does not know that city's time zone, so it left the old one in place.",
      trip_not_found: "That trip is not on this account any more.",
    };
    const code = String(reply.data.error ?? "");
    return { ok: false, message: named[code] ?? (reply.status === 0 ? "You are offline. Nothing was saved." : "Trail could not save this trip.") };
  }, [call, refresh, tripId]);

  /** Ending a trip. Never a delete: `trips` is the root of the purchase, transfer and
   *  receipt cascade, so 0020 revoked DELETE and 0021 gave `archive_trip()` instead. */
  const archiveTrip = useCallback(async (id: string) => {
    const reply = await call("DELETE", `/api/trips/${id}`, {});
    // N1 keeps one line per shop it has mentioned, on this device, keyed by trip. An
    // archived trip has no more shops to walk past, so the key goes with it — by name,
    // never by sweeping a prefix, because the offline outbox lives in localStorage too.
    if (reply.ok) { forgetAlerts(view?.user.id ?? "", id); await refresh(); notify("Trip archived"); return { ok: true, message: "" }; }
    if (reply.status === 503) return { ok: false, message: "Trail cannot archive trips on this server yet." };
    return { ok: false, message: reply.status === 0 ? "You are offline. Nothing was changed." : "Trail could not archive that trip." };
  }, [call, notify, refresh, view?.user.id]);

  const retrySync = useCallback(async () => { const { dropped } = await flush(); settle(); if (!dropped.length) { setFailure(null); notify("Changes saved"); } }, [flush, notify, settle]);

  // ── the brief (still client-side: there is no plan route yet) ──
  const updateBrief = <K extends keyof Brief>(key: K, value: Brief[K]) => { setBriefEdits((current) => ({ ...current, [key]: value })); if (approvedBrief) setRouteDirty(true); };
  const applyPatch = (patch: PlanPatch) => { if (!patch || !Object.keys(patch).length) return; setBriefEdits((current) => ({ ...current, ...patch })); if (approvedBrief) setRouteDirty(true); };
  const applyTags = (patch: { preferenceTags?: PreferenceTag[]; routeTag?: RouteTag | null }) => { if (!patch || !Object.keys(patch).length) return; setTagEdits((current) => ({ ...current, ...patch })); if (approvedBrief) setRouteDirty(true); };
  const clearTags = (keys: BriefField[]) => { if (!keys.length) return; setTagEdits((current) => { const next = { ...current }; if (keys.includes("preferenceTags")) next.preferenceTags = []; if (keys.includes("routeTag")) next.routeTag = null; return next; }); if (approvedBrief) setRouteDirty(true); };
  /** Clearing drops the traveler's edit and falls back to the plan on the server,
   *  which is not the same as writing a default over it. */
  const clearFields = (keys: PlanKey[]) => { if (!keys.length) return; setBriefEdits((current) => { const next = { ...current }; keys.forEach((key) => delete next[key]); return next; }); if (approvedBrief) setRouteDirty(true); };
  const approveBrief = () => { setApprovedByTap({ ...brief }); setRouteDirty(false); };

  return {
    status, error, fromCache, queued, syncedAt, offline, hydrated, refresh, retrySync, failure, clearFailure: () => setFailure(null), pending,
    state: view, trip, tripId, selectTrip, serverPlan, wallet, currency, stops, bought, transfer, lastDelivered: view?.lastDelivered ?? null, pastTransfers: view?.pastTransfers ?? [], trips, labels: view?.labels ?? { stops: null, transfer: null, payment: null },
    items, selectedItems, selectedBagCount, bagCount, toggleItem, deliveryStep, shoppingStarted, todayStopCount, unplannedPurchases: view?.unplannedPurchases ?? [],
    quote, pricingSource, points, partnerCount, eligibility, setEligibility, loadDropoffPoints,
    recipients, budgetChanges, pendingBudgetChange, planId, addRecipient, updateRecipient, archiveRecipient, saveAllocations, applyRecipientOps, proposeBudgetChange, decideBudgetChange,
    saveTrip, archiveTrip, savePurchase, removePurchase, setStopStatus, toggleSaved, openTransfer, saveManifest, confirmTransfer, reportEvent, reportIssue, advanceSimulation,
    paymentRef, setPaymentRef, pass, passError, issuePass, memoryEnabled, setMemoryEnabled: setMemoryOverride, notify, toast,
    plan: brief, activePlan: activeBrief, approvedPlan: approvedBrief, approvePlan: approveBrief, updatePlan: updateBrief, applyPatch, clearFields, applyTags, clearTags, preferenceTags, routeTag, routeDirty, setRouteDirty, estimates,
    messages, setMessages, input, setInput, thinking, setThinking, suggestion, setSuggestion,
  };
}

function Boot({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="app-shell"><main className="app-main boot-screen"><Brand /><h1>{title}</h1><p>{body}</p>{action}</main></div>;
}

/** The provider used to refuse to render anything under `(app)` without a trip, which made
 *  "trip loaded" the price of admission to the whole app — including Home and `My Trips`,
 *  the two screens whose entire job is to exist between trips. The gate moved down to
 *  `<TripGate>`; what is left here is the account-level one.
 *
 *  Only a traveller with **no trips at all** is sent to onboarding, and never on a cached
 *  read: a phone in a basement showing yesterday's trip must not be bounced into a form. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useAppState();
  const router = useRouter();
  const emptyAccount = value.status === "ready" && !value.fromCache && !value.trip && value.trips.length === 0;
  useEffect(() => { if (value.status === "signed-out") router.replace("/login"); }, [router, value.status]);
  useEffect(() => { if (emptyAccount) router.replace("/onboarding"); }, [emptyAccount, router]);

  if (value.status === "idle" || value.status === "loading") return <Boot title="Opening your trips…" body="Reading what this device saved, then checking with Trail." />;
  if (value.status === "signed-out") return <Boot title="Signed out" body="Your session ended. Sign in to get back to your trips." />;
  if (!value.trip && !value.trips.length) return value.status === "error"
    ? <Boot title="Trail could not load your account" body="You are offline or the server is unreachable. Nothing you recorded has been lost." action={<button className="main-button" onClick={() => value.refresh()}><span>Try again<small>Re-read this account from Trail</small></span><i>↻</i></button>} />
    : <Boot title="No trip yet" body="Taking you to set one up." />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** The trip-scoped boundary. `/trail/*`, `/bags/*` and `/ask/*` are all about one trip and
 *  read `trip` without a guard, so this is what proves there is one before they render.
 *
 *  A traveller who has trips but none of them open goes to `My Trips` to pick — not to
 *  onboarding. Being between trips is not the same as never having made one, and the two
 *  used to share a redirect. */
export function TripGate({ children }: { children: React.ReactNode }) {
  const value = useApp();
  const router = useRouter();
  const noTrip = value.status === "ready" && !value.fromCache && !value.trip;
  useEffect(() => { if (noTrip) router.replace(value.trips.length ? "/trips" : "/onboarding"); }, [noTrip, router, value.trips.length]);

  if (value.trip) return <>{children}</>;
  if (value.status === "error") return <Boot title="Trail could not load this trip" body="You are offline or the server is unreachable. Nothing you recorded has been lost." action={<button className="main-button" onClick={() => value.refresh()}><span>Try again<small>Re-read this trip from Trail</small></span><i>↻</i></button>} />;
  return <Boot title="Opening your trip…" body={value.trips.length ? "Choose a trip if this does not open." : "Taking you to set one up."} />;
}
