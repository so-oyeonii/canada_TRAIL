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
import { type Plan as Brief, type PlanKey, type PlanPatch } from "@/app/trail-brief";
import type { OutboxMethod, OutboxOp } from "@/lib/state/outbox";
import { boughtStops, draftItems, deliveryStep as stepFromEvents, routeStops, selectedBagCount as countBags } from "@/lib/state/selectors";
import { computeWallet } from "@/lib/state/shape";
import { EMPTY_WALLET, type DraftItem, type DropoffPoint, type Handling, type IssueKind, type ItemKey, type Purchase, type Stop, type StopId, type StopStatus, type TrailState } from "@/lib/state/types";
import { useTrailState } from "@/lib/state/use-trail-state";
import { createClient as supabaseClient } from "@/lib/supabase/client";
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

export const payMethods = [{ id: "apple", label: "Apple Pay", detail: "Touch or Face ID", mark: "" }, { id: "visa", label: "Visa", detail: "Saved card ending 4242", mark: "V" }, { id: "other", label: "Another card", detail: "Add at the partner point", mark: "+" }];
export const starters = [
  { icon: "M", title: "A gift for my mom", prompt: "I want a thoughtful local gift for my mom under CAD 80." },
  { icon: "F", title: "Two equal gifts", prompt: "I need two different but equal-value gifts for my friends." },
  { icon: "T", title: "Treats for my team", prompt: "I need something easy to share with my 12-person lab team." },
];
export const initialBrief: Brief = { recipient: "My mom", quantity: 1, category: "Home & design", budget: 80, preference: "Thoughtful and useful", localOnly: true, easyPack: true, hotelDelivery: true };
const greeting: Message = { role: "ai", text: "Hi, I’m Trail. Tell me who you’re shopping for and where today takes you. I’ll find gift stops along your route and get the bags back to your hotel." };

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
/** What the screens get. The provider renders nothing under `(app)` until the
 *  trip is loaded, so every screen may read `trip` without a guard — and none of
 *  them may invent one when it is missing. */
export type AppReady = AppValue & { trip: NonNullable<AppValue["trip"]> };
const AppContext = createContext<AppReady | null>(null);
export function useApp(): AppReady { const value = useContext(AppContext); if (!value) throw new Error("useApp called outside AppProvider"); return value; }

function useAppState() {
  const trail = useTrailState();
  const { status, error, fromCache, queued, syncedAt, refresh, queue, flush, pending } = trail;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [picked, setPicked] = useState<{ transferId: string | null; map: Record<ItemKey, boolean> } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [points, setPoints] = useState<DropoffPoint[]>([]);
  const [partnerCount, setPartnerCount] = useState<number | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [failure, setFailure] = useState<WriteFailure | null>(null);
  const [paymentRef, setPaymentRef] = useState("");
  const [briefEdits, setBriefEdits] = useState<Partial<Brief>>({});
  const [approvedByTap, setApprovedByTap] = useState<Brief | null>(null);
  const [routeDirty, setRouteDirty] = useState(false);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [suggestion, setSuggestion] = useState<PlanPatch | null>(null);
  const [memoryOverride, setMemoryOverride] = useState<boolean | null>(null);
  const [toast, setToast] = useState("");
  const offline = !useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); }, []);

  const view = useMemo(() => (trail.state ? withDrafts(trail.state, drafts) : null), [trail.state, drafts]);
  const trip = view?.trip ?? null;
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
  /** Seeded from the plan the server holds, then whatever the traveler has since
   *  typed. Derived, not copied into state: a traveler who set CAD 250 in
   *  onboarding never sees the CAD 80 a constant used to put here. */
  const brief: Brief = useMemo(() => ({ ...initialBrief, ...(serverPlan ? { budget: Math.round(serverPlan.plannedCents / 100), category: serverPlan.category || initialBrief.category, preference: serverPlan.preference || initialBrief.preference, localOnly: serverPlan.localOnly, easyPack: serverPlan.easyPack, hotelDelivery: serverPlan.hotelDelivery } : {}), ...briefEdits }), [serverPlan, briefEdits]);
  const approvedBrief = approvedByTap ?? (serverPlan?.status === "approved" ? brief : null);
  const activeBrief = approvedBrief ?? brief;
  const estimates = useMemo(() => { const count = stops.length || (brief.budget < 60 ? 1 : brief.budget < 130 ? 2 : 3); return { stops: count, minutes: 35 + count * 22 }; }, [brief.budget, stops.length]);
  const memoryEnabled = memoryOverride ?? view?.user.memoryEnabled ?? false;
  const hydrated = status !== "idle" && status !== "loading";

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

  const advanceSimulation = useCallback(async (transferId: string, fail?: "tag_mismatch" | "front_desk_refused") => {
    const reply = await call("POST", `/api/transfers/${transferId}/simulate`, fail ? { fail } : {});
    if (reply.ok) await refresh();
    return reply;
  }, [call, refresh]);

  /** Editing a trip goes to Supabase directly and RLS is what proves the row is
   *  the caller's. Creating one does not: `POST /api/trips` writes the trip and
   *  its plan together, because since 0013 a plan is not something a browser may
   *  write on its own. It is not queued — a hotel change made underground is
   *  reported as failed rather than pretended into the cache. */
  const saveTrip = useCallback(async (patch: Record<string, unknown>) => {
    if (!tripId) return { ok: false, message: "No trip open." };
    const { error: failed } = await supabaseClient().from("trips").update(patch).eq("id", tripId);
    if (failed) return { ok: false, message: failed.message };
    await refresh();
    return { ok: true, message: "" };
  }, [refresh, tripId]);

  const retrySync = useCallback(async () => { const { dropped } = await flush(); settle(); if (!dropped.length) { setFailure(null); notify("Changes saved"); } }, [flush, notify, settle]);

  // ── the brief (still client-side: there is no plan route yet) ──
  const updateBrief = <K extends keyof Brief>(key: K, value: Brief[K]) => { setBriefEdits((current) => ({ ...current, [key]: value })); if (approvedBrief) setRouteDirty(true); };
  const applyPatch = (patch: PlanPatch) => { if (!patch || !Object.keys(patch).length) return; setBriefEdits((current) => ({ ...current, ...patch })); if (approvedBrief) setRouteDirty(true); };
  /** Clearing drops the traveler's edit and falls back to the plan on the server,
   *  which is not the same as writing a default over it. */
  const clearFields = (keys: PlanKey[]) => { if (!keys.length) return; setBriefEdits((current) => { const next = { ...current }; keys.forEach((key) => delete next[key]); return next; }); if (approvedBrief) setRouteDirty(true); };
  const approveBrief = () => { setApprovedByTap({ ...brief }); setRouteDirty(false); };

  return {
    status, error, fromCache, queued, syncedAt, offline, hydrated, refresh, retrySync, failure, clearFailure: () => setFailure(null), pending,
    state: view, trip, serverPlan, wallet, currency, stops, bought, transfer, pastTransfers: view?.pastTransfers ?? [], trips: view?.trips ?? [], labels: view?.labels ?? { stops: null, transfer: null, payment: null },
    items, selectedItems, selectedBagCount, bagCount, toggleItem, deliveryStep, shoppingStarted,
    quote, points, partnerCount, eligibility, setEligibility, loadDropoffPoints,
    recipients, budgetChanges, pendingBudgetChange, planId, addRecipient, updateRecipient, archiveRecipient, saveAllocations, proposeBudgetChange, decideBudgetChange,
    saveTrip, savePurchase, removePurchase, setStopStatus, toggleSaved, openTransfer, saveManifest, confirmTransfer, reportEvent, reportIssue, advanceSimulation,
    paymentRef, setPaymentRef, memoryEnabled, setMemoryEnabled: setMemoryOverride, notify, toast,
    plan: brief, activePlan: activeBrief, approvedPlan: approvedBrief, approvePlan: approveBrief, updatePlan: updateBrief, applyPatch, clearFields, routeDirty, setRouteDirty, estimates,
    messages, setMessages, input, setInput, thinking, setThinking, suggestion, setSuggestion,
  };
}

function Boot({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="app-shell"><main className="app-main boot-screen"><div className="brand"><span>T</span><b>TRAIL</b></div><h1>{title}</h1><p>{body}</p>{action}</main></div>;
}

/** No trip means no screen under `(app)` has anything to render, so the provider
 *  routes rather than letting nine screens each invent an empty state. The server
 *  layout redirects too; this catches the traveler whose last trip goes away while
 *  the app is open, and it never redirects on a cached read. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useAppState();
  const router = useRouter();
  const noTrip = value.status === "ready" && !value.fromCache && !value.trip;
  useEffect(() => { if (value.status === "signed-out") router.replace("/login"); }, [router, value.status]);
  useEffect(() => { if (noTrip) router.replace("/onboarding"); }, [noTrip, router]);

  if (value.status === "idle" || value.status === "loading") return <Boot title="Opening your trip…" body="Reading what this device saved, then checking with Trail." />;
  if (value.status === "signed-out") return <Boot title="Signed out" body="Your session ended. Sign in to get back to your trip." />;
  if (!value.trip) return value.status === "error"
    ? <Boot title="Trail could not load your trip" body="You are offline or the server is unreachable. Nothing you recorded has been lost." action={<button className="main-button" onClick={() => value.refresh()}><span>Try again<small>Re-read this trip from Trail</small></span><i>↻</i></button>} />
    : <Boot title="No trip yet" body="Taking you to set one up." />;
  return <AppContext.Provider value={value as AppReady}>{children}</AppContext.Provider>;
}
