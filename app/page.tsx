"use client";

import { FormEvent, useState } from "react";

type Screen = "home" | "chat" | "plan" | "shop" | "rebalance" | "bags" | "tracking";
type Recipient = { id: string; name: string; note: string; budget: number; color: string; icon: string };
type Product = { id: string; recipientId: string; name: string; store: string; address: string; planned: number; actual?: number; bought: boolean; bags: number; color: string; mark: string; reason: string; weight: string; stock: string };
type Message = { role: "ai" | "user"; text: string };

const initialRecipients: Recipient[] = [
  { id: "mom", name: "Mom", note: "Thoughtful local design", budget: 70, color: "peach", icon: "M" },
  { id: "friends", name: "2 friends", note: "Equal-value gifts", budget: 70, color: "blue", icon: "F" },
  { id: "lab", name: "Lab team", note: "Shareable for 12", budget: 45, color: "yellow", icon: "L" },
  { id: "self", name: "Myself", note: "Leather wallet", budget: 56, color: "green", icon: "ME" },
];

const initialProducts: Product[] = [
  { id: "tea", recipientId: "mom", name: "Ontario stoneware tea set", store: "Spacing Store", address: "401 Richmond · 7 min", planned: 58, bought: false, bags: 0, color: "peach", mark: "C", reason: "Local maker · compact box · made to last", weight: "Light · 0.8 kg", stock: "In stock today" },
  { id: "totes", recipientId: "friends", name: "Toronto graphic totes × 2", store: "Kid Icarus", address: "205 Augusta · 9 min", planned: 68, bought: false, bags: 0, color: "blue", mark: "T", reason: "Different colors · equal value · folds flat", weight: "Very light", stock: "4 colors in stock" },
  { id: "maple", recipientId: "lab", name: "Maple chocolate share box", store: "Blue Banana Market", address: "250 Augusta · 2 min", planned: 39, bought: false, bags: 0, color: "yellow", mark: "S", reason: "24 wrapped pieces · travel-safe packaging", weight: "Medium · 1.2 kg", stock: "In stock today" },
  { id: "wallet", recipientId: "self", name: "Vegetable-tanned card wallet", store: "Good Neighbour", address: "935 Queen W · 11 min", planned: 52, bought: false, bags: 0, color: "green", mark: "W", reason: "Canadian studio · slim · everyday use", weight: "Pocket size", stock: "Low stock" },
];

function Brand() { return <div className="brand"><span>T</span><b>TRAIL</b></div>; }
function Header({ title, back, action }: { title?: string; back?: () => void; action?: React.ReactNode }) { return <header className="app-header">{back ? <button className="round" onClick={back}>←</button> : <Brand />}{title && <b className="header-title">{title}</b>}<div className="header-action">{action}</div></header>; }
function Money({ value }: { value: number }) { return <>CAD ${value}</>; }

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [totalBudget, setTotalBudget] = useState(250);
  const [recipients, setRecipients] = useState(initialRecipients);
  const [products, setProducts] = useState(initialProducts);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [actualPrice, setActualPrice] = useState(0);
  const [bagCount, setBagCount] = useState(1);
  const [driverAssigned, setDriverAssigned] = useState(false);
  const [deliveryStep, setDeliveryStep] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "ai", text: "Tell me who you are shopping for, what you might want for yourself, and your total budget." }]);

  const deliveryReserve = 9;
  const bought = products.filter((item) => item.bought);
  const purchasedSpend = bought.reduce((sum, item) => sum + (item.actual ?? item.planned), 0);
  const plannedOpen = products.filter((item) => !item.bought).reduce((sum, item) => sum + item.planned, 0);
  const committed = purchasedSpend + plannedOpen + deliveryReserve;
  const remaining = totalBudget - purchasedSpend - deliveryReserve;
  const variance = bought.reduce((sum, item) => sum + (item.actual ?? item.planned) - item.planned, 0);
  const totalBags = bought.reduce((sum, item) => sum + item.bags, 0);
  const progress = Math.round((bought.length / products.length) * 100);

  const go = (next: Screen) => { setScreen(next); window.setTimeout(() => document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" }), 0); };
  const recipient = (id: string) => recipients.find((item) => item.id === id)!;
  const updateRecipient = (id: string, patch: Partial<Recipient>) => setRecipients((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const send = (text: string) => {
    const clean = text.trim(); if (!clean) return;
    const lower = clean.toLowerCase();
    const amount = clean.match(/(?:cad|\$)\s?(\d+)|(\d+)\s?(?:cad|dollars?)/i);
    if (amount) setTotalBudget(Number(amount[1] || amount[2]));
    if (/wallet|something for me|myself/.test(lower)) updateRecipient("self", { note: "Personal wishlist included" });
    if (/share|team|lab/.test(lower)) updateRecipient("lab", { note: "Easy to share with 12" });
    if (/equal|friends/.test(lower)) updateRecipient("friends", { note: "Two equal-value gifts" });
    setMessages((current) => [...current, { role: "user", text: clean }, { role: "ai", text: "I updated the trip wallet and shopping brief. Review the draft when you are ready — every budget stays editable." }]);
    setChatInput("");
  };
  const submitChat = (event: FormEvent) => { event.preventDefault(); send(chatInput); };

  const openPurchase = (item: Product) => { setPurchaseId(item.id); setActualPrice(item.planned); setBagCount(1); };
  const confirmPurchase = () => {
    setProducts((current) => current.map((item) => item.id === purchaseId ? { ...item, bought: true, actual: actualPrice, bags: bagCount } : item));
    setPurchaseId(null);
  };
  const undoPurchase = (id: string) => setProducts((current) => current.map((item) => item.id === id ? { ...item, bought: false, actual: undefined, bags: 0 } : item));
  const approveRebalance = () => {
    if (variance > 0) updateRecipient("self", { budget: Math.max(20, recipient("self").budget - variance) });
    go("shop");
  };

  const nav = [
    { key: "home", label: "Home", icon: "⌂", target: "home" as Screen },
    { key: "chat", label: "Ask AI", icon: "✦", target: "chat" as Screen },
    { key: "shop", label: "Shop", icon: "◇", target: "shop" as Screen },
    { key: "bags", label: "Bags", icon: "▱", target: "bags" as Screen },
  ];

  return <main className="stage"><section className="phone" aria-live="polite">
    <div className="status"><span>9:41</span><div><i /><i /><b /></div></div>

    {screen === "home" && <div className="screen home-screen">
      <Header action={<button className="avatar">SY</button>} />
      <div className="trip-line"><span><i />Toronto · Day 2</span><button>Edit</button></div>
      <section className="home-title"><p>YOUR SHOPPING DAY</p><h1>Good morning.<br /><em>Let’s shop lighter.</em></h1></section>
      <button className="hotel-card"><i>H</i><span><small>DELIVER TO</small><b>The Annex Hotel</b><em>Front desk · 12 min from route</em></span><strong>›</strong></button>
      <section className="wallet-card"><header><span><small>TRIP SHOPPING WALLET</small><b><Money value={totalBudget} /></b></span><button onClick={() => go("plan")}>Adjust</button></header><div className="wallet-bar"><i style={{ width: `${Math.min(100, (purchasedSpend / totalBudget) * 100)}%` }} /><em style={{ width: `${Math.min(100, (plannedOpen / totalBudget) * 100)}%` }} /></div><div className="wallet-stats"><span><small>Spent</small><b><Money value={purchasedSpend} /></b></span><span><small>Planned</small><b><Money value={plannedOpen} /></b></span><span><small>Free</small><b><Money value={Math.max(0, totalBudget - committed)} /></b></span></div></section>
      <button className="ask-trail" onClick={() => go("chat")}><i>✦</i><span><small>ASK TRAIL AI</small><b>Not sure what to buy?</b><em>Talk through gifts and your own wishlist</em></span><strong>→</strong></button>
      <section className="today-plan"><div className="section-head"><span><b>Today’s plan</b><small>{products.length} items · 4 stores · 1 hr 55 min</small></span><button onClick={() => go("shop")}>Open route</button></div><div className="progress-card"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span>{bought.length}/{products.length}</span></div><span><b>{bought.length ? `${bought.length} purchased` : "Ready to start"}</b><small>{bought.length ? `${totalBags} bags · ${remaining} CAD left` : "First stop: Spacing Store"}</small></span><button onClick={() => go(bought.length ? "shop" : "plan")}>→</button></div></section>
      {totalBags > 0 && <button className="bag-alert" onClick={() => go("bags")}><i>▱</i><span><b>{totalBags} bags are ready to move</b><small>Send them to your hotel from the route</small></span><strong>→</strong></button>}
    </div>}

    {screen === "chat" && <div className="screen chat-screen">
      <Header title="Ask Trail" back={() => go("home")} action={<button className="link-button" onClick={() => go("plan")}>View plan</button>} />
      <div className="ai-profile"><i>✦</i><span><b>Trail AI</b><small>Shopping planner · online</small></span><em>LIVE PLAN</em></div>
      <div className="messages">{messages.map((message, index) => <div className={`bubble ${message.role}`} key={index}>{message.role === "ai" && <i>✦</i>}<p>{message.text}</p></div>)}</div>
      <div className="prompt-chips"><button onClick={() => send("I need equal gifts for two friends.")}>Two equal gifts</button><button onClick={() => send("Include a leather wallet for myself.")}>Add my wishlist</button><button onClick={() => send("My total budget is CAD 250.")}>Budget $250</button></div>
      <div className="chat-draft"><span><small>LIVE TRIP WALLET</small><b>{recipients.length} targets · hotel delivery</b></span><strong><Money value={totalBudget} /></strong><button onClick={() => go("plan")}>Review →</button></div>
      <form className="composer" onSubmit={submitChat}><button type="button">＋</button><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Tell Trail what you need…" /><button type="submit">↑</button></form>
    </div>}

    {screen === "plan" && <div className="screen plan-screen">
      <Header title="Shopping plan" back={() => go("home")} action={<span className="pill">AI DRAFT</span>} />
      <div className="plan-title"><i>✦</i><span><p>READY TO CUSTOMIZE</p><h1>One budget.<br />Everyone included.</h1><small>Gifts and your own wishlist share the same trip wallet.</small></span></div>
      <section className="total-editor"><span><small>TOTAL SHOPPING BUDGET</small><b><Money value={totalBudget} /></b></span><input type="range" min="160" max="400" step="10" value={totalBudget} onChange={(e) => setTotalBudget(Number(e.target.value))} /><div><small>$160</small><small>$400</small></div></section>
      <div className="section-head"><span><b>Budget by person</b><small>Tap any amount to change it</small></span><strong><Money value={recipients.reduce((s, r) => s + r.budget, 0) + deliveryReserve} /></strong></div>
      <section className="recipient-edit-list">{recipients.map((item) => <article key={item.id}><i className={item.color}>{item.icon}</i><span><input value={item.name} onChange={(e) => updateRecipient(item.id, { name: e.target.value })} /><small>{item.note}</small></span><label><small>BUDGET</small><b>$</b><input type="number" value={item.budget} onChange={(e) => updateRecipient(item.id, { budget: Number(e.target.value) })} /></label></article>)}</section>
      <div className="delivery-row"><i>▱</i><span><b>Hotel delivery reserve</b><small>One pickup from a partner store</small></span><strong>$9</strong></div>
      <div className={recipients.reduce((s, r) => s + r.budget, 0) + deliveryReserve <= totalBudget ? "budget-check ok" : "budget-check over"}><i>{recipients.reduce((s, r) => s + r.budget, 0) + deliveryReserve <= totalBudget ? "✓" : "!"}</i><span><b>{recipients.reduce((s, r) => s + r.budget, 0) + deliveryReserve <= totalBudget ? "Your plan fits the wallet" : "Your allocations exceed the wallet"}</b><small>{Math.abs(totalBudget - recipients.reduce((s, r) => s + r.budget, 0) - deliveryReserve)} CAD {recipients.reduce((s, r) => s + r.budget, 0) + deliveryReserve <= totalBudget ? "unassigned flexibility" : "over budget"}</small></span></div>
      <button className="primary" disabled={recipients.reduce((s, r) => s + r.budget, 0) + deliveryReserve > totalBudget} onClick={() => go("shop")}><span>Approve & find products<small>Match items with physical stores</small></span><i>→</i></button>
    </div>}

    {screen === "shop" && <div className="screen shop-screen">
      <Header title="Shop" back={() => go("home")} action={<button className="link-button" onClick={() => go("plan")}>Edit plan</button>} />
      <div className="shop-summary"><span><p>LIVE SHOPPING BALANCE</p><h1><Money value={remaining} /> left</h1><small>{bought.length} of {products.length} purchased · delivery reserve protected</small></span><div className="mini-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}>{progress}%</div></div>
      <div className="route-strip"><i>YOU</i><span /><i>1</i><span /><i>2</i><span /><i>3</i><span /><i>4</i><span /><i>DROP</i></div>
      <div className="product-list">{products.map((item) => <article className={item.bought ? "product bought" : "product"} key={item.id}><div className={`product-art ${item.color}`}>{item.mark}</div><div className="product-info"><small>{recipient(item.recipientId).name.toUpperCase()}</small><h2>{item.name}</h2><p><b>{item.store}</b> · {item.address}</p><em>✦ {item.reason}</em><div><span>{item.stock}</span><span>{item.weight}</span></div></div><aside><b>${item.bought ? item.actual : item.planned}</b>{item.bought ? <button onClick={() => undoPurchase(item.id)}>✓ Bought</button> : <button onClick={() => openPurchase(item)}>Mark bought</button>}</aside></article>)}</div>
      {bought.length > 0 && <div className="shop-footer"><span><small>ACTUAL SPEND</small><b><Money value={purchasedSpend} /></b></span>{variance !== 0 ? <button onClick={() => go("rebalance")}>Review balance →</button> : <button onClick={() => go("bags")}>Send bags →</button>}</div>}
    </div>}

    {screen === "rebalance" && <div className="screen rebalance-screen">
      <Header title="Budget update" back={() => go("shop")} action={<span className="pill alert">${Math.abs(variance)} {variance > 0 ? "OVER" : "SAVED"}</span>} />
      <div className="rebalance-title"><i>↻</i><p>TRAIL RECALCULATED</p><h1>Your real spend<br />changed the plan.</h1><span>{variance > 0 ? `You spent CAD $${variance} more than planned. Here is a safe adjustment that keeps every gift.` : `You saved CAD $${Math.abs(variance)}. Keep it as flexibility or move it to another gift.`}</span></div>
      <section className="variance-card"><header><span>Planned purchase total</span><b><Money value={products.reduce((s, p) => s + p.planned, 0)} /></b></header><header><span>Updated purchase total</span><b><Money value={products.reduce((s, p) => s + (p.actual ?? p.planned), 0)} /></b></header><div><span>Difference</span><strong>{variance > 0 ? "+" : "−"}${Math.abs(variance)}</strong></div></section>
      <div className="section-head"><span><b>Suggested rebalance</b><small>Nothing changes until you approve</small></span></div>
      <section className="rebalance-list">{recipients.map((item) => <div key={item.id}><i className={item.color}>{item.icon}</i><span><b>{item.name}</b><small>{item.id === "self" && variance > 0 ? "Use personal flexibility first" : "Keep approved budget"}</small></span><em>${item.budget}</em><strong>→</strong><b>${item.id === "self" && variance > 0 ? Math.max(20, item.budget - variance) : item.budget}</b></div>)}</section>
      <button className="primary" onClick={approveRebalance}><span>Approve rebalance<small>Apply this to remaining recommendations</small></span><i>✓</i></button><button className="secondary" onClick={() => go("plan")}>Edit budgets manually</button>
    </div>}

    {screen === "bags" && <div className="screen bags-screen">
      <Header title="Bags" back={() => go("home")} action={<span className="pill">{totalBags} BAGS</span>} />
      <div className="bag-hero"><div><i>TRAIL</i><i>LOCAL</i><span>{totalBags || 0}</span></div><p>HANDS-FREE DELIVERY</p><h1>Leave the weight.<br /><em>Keep the day.</em></h1><span>{totalBags ? "Your route ends at a delivery partner. Seal every purchased bag and send them together." : "Mark purchases as bought first. Trail will count your bags and recommend the best drop point."}</span></div>
      <section className="delivery-context"><div><i>⌂</i><span><small>DELIVER TO</small><b>The Annex Hotel</b><em>Front desk · Guest: Soo Y.</em></span><button>Edit</button></div><div><i>▱</i><span><small>PICK UP FROM</small><b>Blue Banana Market</b><em>Route partner · Open until 7 PM</em></span><button>Map</button></div></section>
      <div className="delivery-why"><i>✦</i><span><b>Trail recommends delivery</b><small>{totalBags || 3} bags · about 2.4 kg · 4 hours left in your itinerary</small></span></div>
      <section className="delivery-price"><span><small>SAME-DAY HOTEL DELIVERY</small><b>CAD $9</b></span><div><small>Pickup</small><b>Within 12 min</b></div><div><small>Arrival</small><b>6:30–7:00 PM</b></div></section>
      <button className="primary dark" disabled={!totalBags} onClick={() => { setDriverAssigned(true); setDeliveryStep(1); go("tracking"); }}><span>Request a driver<small>Store staff will seal and hand off the bags</small></span><i>→</i></button>
    </div>}

    {screen === "tracking" && <div className="screen tracking-screen">
      <Header action={<button className="link-button light" onClick={() => go("home")}>Done</button>} />
      <div className="tracking-hero"><div>✦</div><p>{driverAssigned ? "DRIVER ASSIGNED" : "DELIVERY PREVIEW"}</p><h1>{deliveryStep >= 3 ? "At your hotel." : "Your bags are moving."}</h1><span>{deliveryStep >= 3 ? "The Annex Hotel front desk received every sealed bag." : "Keep exploring. Trail is watching the handoff for you."}</span></div>
      <section className="driver-card"><i>DR</i><span><small>YOUR DRIVER</small><b>Daniel R. · 4.9 ★</b><em>Blue Toyota Corolla · CXT 418</em></span><button>Call</button></section>
      <section className="track-card"><header><span>TR–2718 · {totalBags} sealed bags</span><b>{["Assigned", "Picked up", "On the way", "Delivered"][deliveryStep]}</b></header><div>{["Assigned", "Store pickup", "Hotel route", "Front desk"].map((label, index) => <span className={index <= deliveryStep ? "done" : ""} key={label}><i>{index < deliveryStep ? "✓" : ""}</i><small>{label}</small></span>)}</div><footer><span>Estimated arrival</span><b>{deliveryStep >= 3 ? "6:42 PM" : "6:30–7:00 PM"}</b></footer>{deliveryStep < 3 && <button onClick={() => setDeliveryStep((value) => Math.min(3, value + 1))}>Preview next delivery status →</button>}</section>
      <div className="handoff-note"><i>◎</i><span><b>Protected handoff</b><small>Seal code, driver pickup, and front-desk recipient are recorded.</small></span></div>
    </div>}

    {purchaseId && <div className="sheet-backdrop" onClick={() => setPurchaseId(null)}><section className="purchase-sheet" onClick={(e) => e.stopPropagation()}><i className="grabber" /><div className="purchase-title"><span>✓</span><div><small>PURCHASED AT {products.find((p) => p.id === purchaseId)?.store.toUpperCase()}</small><h2>{products.find((p) => p.id === purchaseId)?.name}</h2></div></div><label><span>Actual price</span><div>CAD $<input type="number" value={actualPrice} onChange={(e) => setActualPrice(Number(e.target.value))} /></div></label><label><span>Shopping bags</span><div className="stepper"><button onClick={() => setBagCount(Math.max(1, bagCount - 1))}>−</button><b>{bagCount}</b><button onClick={() => setBagCount(bagCount + 1)}>＋</button></div></label><div className="sheet-impact"><i>✦</i><span><b>Budget impact</b><small>{actualPrice - (products.find((p) => p.id === purchaseId)?.planned ?? 0) === 0 ? "Exactly as planned" : `${Math.abs(actualPrice - (products.find((p) => p.id === purchaseId)?.planned ?? 0))} CAD ${actualPrice > (products.find((p) => p.id === purchaseId)?.planned ?? 0) ? "over" : "under"} plan`}</small></span></div><button className="primary" onClick={confirmPurchase}><span>Save purchase<small>Update wallet and bag count</small></span><i>✓</i></button></section></div>}

    <nav className={screen === "tracking" ? "tab-bar dark-tabs" : "tab-bar"}>{nav.map((item) => <button className={screen === item.key || (item.key === "shop" && ["plan", "rebalance"].includes(screen)) || (item.key === "bags" && screen === "tracking") ? "active" : ""} onClick={() => go(item.target)} key={item.key}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav><div className="home-indicator" />
  </section></main>;
}
