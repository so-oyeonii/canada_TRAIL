"use client";

/** The prototype's client state, lifted out of `app/page.tsx` so the nine screens
 *  can become routes without losing what they shared.
 *
 *  One thing changed on the way across: stops are keyed by a product id, not by a
 *  position in an array. `purchases[1]` used to mean "whatever is second on the
 *  route", so tapping Replace moved a recorded purchase onto a different gift. The
 *  ids here are the shape `stops.id` will have once T3-B reads the server, and the
 *  route is a list of ids exactly like `routeStops()` returns.
 *
 *  The device blob is written under a new key. `trail-v3-state` is the legacy
 *  format `POST /api/import` still parses (index-keyed maps); overwriting it with
 *  id-keyed maps would make that import read purchases it cannot place. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Plan, type PlanKey, type PlanPatch } from "@/app/trail-brief";

export type Handling = "Standard" | "Heavy" | "Fragile" | "Chilled";
export type PurchaseStatus = "planned" | "bought" | "unavailable" | "skipped";
export type Purchase = { status: PurchaseStatus; actualPrice: number; quantity: number; bags: number; handling: Handling };
export type TransferStatus = "none" | "draft" | "active" | "completed";
export type Message = { role: "ai" | "user"; text: string };
export type Trip = { country: string; city: string; areas: string[]; startDate: string; endDate: string; hotel: string; hotelAddress: string; companions: string; freeTime: string };
export type PastTrip = { id: string; city: string; country: string; dates: string; areas: string[]; purchases: string; spend: number; insight: string; color: string };
export type Product = { id: string; name: string; store: string; address: string; detour: string; closes: string; confidence: string; transfer: string; color: string; mark: string; reason: string; handling: Handling; alternative: string; share: number };
export type Stop = Product & { area: string; price: number; sequence: number };

export const DELIVERY_FEE = 9;
export const DEVICE_KEY = "trail-app-v4";
export const payMethods = [{ id: "apple", label: "Apple Pay", detail: "Touch or Face ID", mark: "" }, { id: "visa", label: "Visa", detail: "Saved card ending 4242", mark: "V" }, { id: "other", label: "Another card", detail: "Add at the partner point", mark: "+" }];
export const failureCopy: Record<string, string> = { card_declined: "Your bank declined the charge.", insufficient_funds: "There were not enough funds on the card.", expired_card: "That card has expired.", processing_error: "The payment service could not be reached." };
export const starters = [
  { icon: "M", title: "A gift for my mom", prompt: "I want a thoughtful local gift for my mom under CAD 80." },
  { icon: "F", title: "Two equal gifts", prompt: "I need two different but equal-value gifts for my friends." },
  { icon: "T", title: "Treats for my team", prompt: "I need something easy to share with my 12-person lab team." },
];
export const pastTrips: PastTrip[] = [
  { id: "tokyo", city: "Tokyo", country: "Japan", dates: "Apr 3–9, 2025", areas: ["Kichijoji", "Kuramae", "Ginza"], purchases: "Stationery · tea · ceramics", spend: 184, insight: "You chose small, useful objects from independent makers.", color: "peach" },
  { id: "copenhagen", city: "Copenhagen", country: "Denmark", dates: "Sep 12–16, 2024", areas: ["Nørrebro", "Vesterbro"], purchases: "Home design · chocolate", spend: 142, insight: "You preferred local design and paid more for packable quality.", color: "blue" },
];

/** Sample catalog. Every entry names the stop it swaps with, so Replace produces a
 *  different id instead of mutating the one a purchase is attached to. */
export const catalog: Record<string, Product> = {
  stoneware: { id: "stoneware", name: "Ontario stoneware tea set", store: "Spacing Store", address: "401 Richmond St W", detour: "+7 min", closes: "Open until 6 PM", confidence: "Recently seen", transfer: "Fragile transfer", color: "peach", mark: "C", reason: "Local maker · fits Mom’s budget", handling: "Fragile", alternative: "espresso", share: .48 },
  tote: { id: "tote", name: "Toronto linen market tote", store: "Kid Icarus", address: "205 Augusta Ave", detour: "+4 min", closes: "Open until 7 PM", confidence: "Call to confirm", transfer: "Standard transfer", color: "blue", mark: "T", reason: "Useful every day · folds flat", handling: "Standard", alternative: "pouch", share: .31 },
  chocolate: { id: "chocolate", name: "Maple chocolate collection", store: "Blue Banana", address: "250 Augusta Ave", detour: "+2 min", closes: "Open until 8 PM", confidence: "Recently seen", transfer: "Chilled transfer", color: "yellow", mark: "M", reason: "Local favorite · ice pack ready", handling: "Chilled", alternative: "berry", share: .21 },
  espresso: { id: "espresso", name: "Hand-thrown espresso pair", store: "Craft Ontario Shop", address: "1106 Queen St W", detour: "+5 min", closes: "Open until 7 PM", confidence: "Sample availability", transfer: "Fragile transfer", color: "yellow", mark: "A", reason: "Nearby alternative · same recipient budget", handling: "Fragile", alternative: "stoneware", share: .48 },
  pouch: { id: "pouch", name: "Toronto risograph zip pouch", store: "Likely General", address: "389 Roncesvalles Ave", detour: "+6 min", closes: "Open until 6 PM", confidence: "Sample availability", transfer: "Standard transfer", color: "peach", mark: "A", reason: "Nearby alternative · useful and packable", handling: "Standard", alternative: "tote", share: .31 },
  berry: { id: "berry", name: "Ontario berry chocolate box", store: "SOMA Chocolatemaker", address: "32 Tank House Lane", detour: "+3 min", closes: "Open until 8 PM", confidence: "Sample availability", transfer: "Chilled transfer", color: "blue", mark: "A", reason: "Nearby alternative · ice-pack handling", handling: "Chilled", alternative: "chocolate", share: .21 },
};

export const initialPlan: Plan = { recipient: "My mom", quantity: 1, category: "Home & design", budget: 80, preference: "Thoughtful and useful", time: "2 hours", localOnly: true, easyPack: true, hotelDelivery: true };
export const initialTrip: Trip = { country: "Canada", city: "Toronto", areas: ["Kensington Market", "Queen West", "Distillery District"], startDate: "2026-08-12", endDate: "2026-08-16", hotel: "The Annex Hotel", hotelAddress: "296 Brunswick Ave", companions: "Solo trip", freeTime: "3 hours" };
const initialRoute = ["stoneware", "tote", "chocolate"];
const greeting: Message = { role: "ai", text: "Hi, I’m Trail. Tell me who you’re shopping for and where today takes you. I’ll find gift stops along your route and get the bags back to your hotel." };

export type AppValue = ReturnType<typeof useAppState>;
const AppContext = createContext<AppValue | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error("useApp called outside AppProvider"); return value; }

function useAppState() {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [approvedPlan, setApprovedPlan] = useState<Plan | null>(null);
  const [routeDirty, setRouteDirty] = useState(false);
  const [route, setRoute] = useState<string[]>(initialRoute);
  const [purchases, setPurchases] = useState<Record<string, Purchase>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [selectedBags, setSelectedBags] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [suggestion, setSuggestion] = useState<PlanPatch | null>(null);
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("none");
  const [deliveryStep, setDeliveryStep] = useState(0);
  const [paymentRef, setPaymentRef] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); }, []);
  const activePlan = approvedPlan ?? plan;
  const estimates = useMemo(() => { const count = plan.budget < 60 ? 1 : plan.budget < 130 ? 2 : 3; return { stops: count, minutes: 35 + count * 22, transfer: plan.hotelDelivery ? 12 : 0 }; }, [plan.budget, plan.hotelDelivery]);
  const stops: Stop[] = route.map((id, index) => ({ ...catalog[id], area: trip.areas[index % Math.max(1, trip.areas.length)] ?? trip.city, price: Math.max(18, Math.round(activePlan.budget * catalog[id].share)), sequence: index + 1 }));
  const bought = stops.filter((stop) => purchases[stop.id]?.status === "bought");
  const spent = bought.reduce((sum, stop) => sum + purchases[stop.id].actualPrice, 0);
  const bagCount = bought.reduce((sum, stop) => sum + purchases[stop.id].bags, 0);
  const remaining = activePlan.budget - spent;
  const selectedBagCount = bought.reduce((sum, stop) => sum + (selectedBags[stop.id] ? purchases[stop.id].bags : 0), 0);
  const shoppingStarted = stops.some((stop) => purchases[stop.id] && purchases[stop.id].status !== "planned");
  const tripDates = `${new Date(`${trip.startDate}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}–${new Date(`${trip.endDate}T00:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;

  const updatePlan = <K extends keyof Plan>(key: K, value: Plan[K]) => { setPlan((current) => ({ ...current, [key]: value })); if (approvedPlan) setRouteDirty(true); };
  const updateTrip = <K extends keyof Trip>(key: K, value: Trip[K]) => setTrip((current) => ({ ...current, [key]: value }));
  const applyPatch = (patch: PlanPatch) => { if (!patch || !Object.keys(patch).length) return; setPlan((current) => ({ ...current, ...patch })); if (approvedPlan) setRouteDirty(true); };
  const clearFields = (keys: PlanKey[]) => { if (!keys.length) return; setPlan((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, initialPlan[key]])) })); if (approvedPlan) setRouteDirty(true); };
  const approvePlan = () => { setApprovedPlan({ ...plan }); setRouteDirty(false); };
  const stopAt = (id: string): Stop | null => stops.find((stop) => stop.id === id) ?? null;
  const purchaseAt = (id: string): Purchase | null => purchases[id] ?? null;
  const setPurchase = (id: string, patch: Partial<Purchase>) => { const stop = stopAt(id); if (!stop) return; const base: Purchase = { status: "planned", actualPrice: stop.price, quantity: 1, bags: 1, handling: stop.handling }; setPurchases((current) => ({ ...current, [id]: { ...base, ...current[id], ...patch } })); };
  const savePurchase = (id: string, purchase: Purchase) => { setPurchases((current) => ({ ...current, [id]: { ...purchase, status: "bought" } })); setSelectedBags((current) => ({ ...current, [id]: true })); };
  const toggleSaved = (id: string) => { setSaved((current) => ({ ...current, [id]: !current[id] })); notify(saved[id] ? "Stop removed from your route" : "Stop saved to your route"); };
  /** Replacing swaps the id at that position. A recorded purchase stays attached to
   *  the id that was actually bought, so it leaves the route with its own stop. */
  const replaceStop = (id: string) => { notify("Searching nearby sample stores…"); window.setTimeout(() => { setRoute((current) => current.map((entry) => (entry === id ? catalog[entry].alternative : entry))); notify("Nearby alternative added to your route"); }, 650); };
  const openTransfer = () => { setSelectedBags(Object.fromEntries(bought.map((stop) => [stop.id, true]))); setTransferStatus("draft"); };
  const deviceBlob = () => JSON.stringify({ trip, plan, approvedPlan, route, purchases, saved, transferStatus, deliveryStep, memoryEnabled });
  const saveDeviceState = () => { try { localStorage.setItem(DEVICE_KEY, deviceBlob()); } catch { /* private mode: the trip is still on screen */ } notify("Trip and progress saved on this device"); };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const raw = localStorage.getItem(DEVICE_KEY); if (raw) { const s = JSON.parse(raw); if (s.trip) setTrip(s.trip); if (s.plan) setPlan(s.plan); if (s.approvedPlan) setApprovedPlan(s.approvedPlan); if (Array.isArray(s.route) && s.route.every((id: string) => catalog[id])) setRoute(s.route); if (s.purchases) setPurchases(s.purchases); if (s.saved) setSaved(s.saved); if (s.transferStatus) setTransferStatus(s.transferStatus); if (s.deliveryStep) setDeliveryStep(s.deliveryStep); if (typeof s.memoryEnabled === "boolean") setMemoryEnabled(s.memoryEnabled); } } catch { localStorage.removeItem(DEVICE_KEY); }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ trip, plan, approvedPlan, route, purchases, saved, transferStatus, deliveryStep, memoryEnabled })); } catch { /* quota */ } }, [hydrated, trip, plan, approvedPlan, route, purchases, saved, transferStatus, deliveryStep, memoryEnabled]);

  return { trip, setTrip, updateTrip, plan, setPlan, approvedPlan, activePlan, approvePlan, routeDirty, setRouteDirty, updatePlan, applyPatch, clearFields, estimates, route, stops, stopAt, purchases, purchaseAt, setPurchase, savePurchase, saved, toggleSaved, replaceStop, selectedBags, setSelectedBags, bought, spent, bagCount, remaining, selectedBagCount, shoppingStarted, tripDates, messages, setMessages, input, setInput, thinking, setThinking, suggestion, setSuggestion, transferStatus, setTransferStatus, openTransfer, deliveryStep, setDeliveryStep, paymentRef, setPaymentRef, memoryEnabled, setMemoryEnabled, toast, notify, hydrated, saveDeviceState };
}

export function AppProvider({ children }: { children: React.ReactNode }) { const value = useAppState(); return <AppContext.Provider value={value}>{children}</AppContext.Provider>; }
