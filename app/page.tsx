"use client";

import { useMemo, useState } from "react";

type Screen = "budget" | "picks" | "drop" | "tracking";
type Tier = "light" | "balanced" | "special";

type Gift = {
  id: string;
  for: string;
  name: string;
  store: string;
  area: string;
  price: number;
  reason: string;
  color: string;
  symbol: string;
};

const giftSets: Record<Tier, Gift[]> = {
  light: [
    { id: "mom-light", for: "MOM", name: "Ceramic tea cup", store: "Spacing Store", area: "7 min walk", price: 42, reason: "Local, thoughtful, and easy to pack.", color: "peach", symbol: "C" },
    { id: "friends-light", for: "2 FRIENDS", name: "City pins + mini totes", store: "Kid Icarus", area: "9 min walk", price: 56, reason: "Two equal-value gifts, different designs.", color: "blue", symbol: "T" },
    { id: "team-light", for: "LAB TEAM", name: "Maple candy share pack", store: "Blue Banana", area: "2 min walk", price: 38, reason: "24 wrapped pieces for easy sharing.", color: "yellow", symbol: "M" },
  ],
  balanced: [
    { id: "mom-balanced", for: "MOM", name: "Ontario tea set", store: "Spacing Store", area: "7 min walk", price: 58, reason: "The most meaningful local pick in your range.", color: "peach", symbol: "C" },
    { id: "friends-balanced", for: "2 FRIENDS", name: "Toronto graphic totes", store: "Kid Icarus", area: "9 min walk", price: 72, reason: "Different colors, same price. Fair and packable.", color: "blue", symbol: "T" },
    { id: "team-balanced", for: "LAB TEAM", name: "Maple chocolate box", store: "Blue Banana", area: "2 min walk", price: 54, reason: "30 wrapped pieces, ready to share back home.", color: "yellow", symbol: "M" },
  ],
  special: [
    { id: "mom-special", for: "MOM", name: "Canadian wool throw", store: "Spacing Store", area: "7 min walk", price: 84, reason: "A lasting premium gift with compact packing.", color: "peach", symbol: "W" },
    { id: "friends-special", for: "2 FRIENDS", name: "Limited art prints", store: "Kid Icarus", area: "9 min walk", price: 96, reason: "A matched pair from one Toronto collection.", color: "blue", symbol: "A" },
    { id: "team-special", for: "LAB TEAM", name: "Canadian snack edit", store: "Blue Banana", area: "2 min walk", price: 68, reason: "Sweet and savory picks for mixed tastes.", color: "yellow", symbol: "S" },
  ],
};

const navItems = [
  { screen: "budget" as Screen, label: "Plan", icon: "⌁" },
  { screen: "picks" as Screen, label: "Picks", icon: "◇" },
  { screen: "drop" as Screen, label: "Drop", icon: "▱" },
  { screen: "tracking" as Screen, label: "Track", icon: "⌖" },
];

function Money({ value }: { value: number }) {
  return <>${value}</>;
}

function Brand() {
  return <div className="brand"><span>T</span><b>TRAIL</b></div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("budget");
  const [budget, setBudget] = useState(200);
  const [selectedIds, setSelectedIds] = useState(giftSets.balanced.map((gift) => gift.id));
  const [deliveryStep, setDeliveryStep] = useState(1);

  const tier: Tier = budget < 170 ? "light" : budget > 250 ? "special" : "balanced";
  const gifts = giftSets[tier];
  const selected = gifts.filter((gift) => selectedIds.includes(gift.id));
  const productTotal = selected.reduce((sum, gift) => sum + gift.price, 0);
  const deliveryFee = selected.length ? 9 : 0;
  const total = productTotal + deliveryFee;
  const remaining = budget - total;

  const split = useMemo(() => {
    const spendable = Math.max(budget - 9, 0);
    return [Math.round(spendable * .31), Math.round(spendable * .38), Math.round(spendable * .31)];
  }, [budget]);

  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const updateBudget = (value: number) => {
    const nextTier: Tier = value < 170 ? "light" : value > 250 ? "special" : "balanced";
    setBudget(value);
    setSelectedIds(giftSets[nextTier].map((gift) => gift.id));
  };

  const toggleGift = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <main className="stage">
      <section className="phone" aria-live="polite">
        <div className="status-bar"><span>9:41</span><div><i /><i /><b /></div></div>

        {screen === "budget" && (
          <div className="screen budget-screen">
            <header className="app-header"><Brand /><button className="avatar" aria-label="Open profile">SY</button></header>
            <div className="welcome"><p>TORONTO · 3 HOURS FREE</p><h1>Shop smart.<br /><em>Travel light.</em></h1><span>Plan gifts that fit your budget, then send every bag straight to your hotel.</span></div>

            <div className="budget-pass">
              <div className="pass-top"><span>GIFT BUDGET</span><b>CAD <Money value={budget} /></b></div>
              <input type="range" min="120" max="340" step="10" value={budget} onChange={(event) => updateBudget(Number(event.target.value))} aria-label="Gift budget" />
              <div className="range-label"><span>$120</span><span>$340</span></div>
              <div className="tear" />
              <div className="budget-split">
                <div><i className="peach" /><span>Mom</span><b><Money value={split[0]} /></b></div>
                <div><i className="blue" /><span>2 friends</span><b><Money value={split[1]} /></b></div>
                <div><i className="yellow" /><span>Lab team</span><b><Money value={split[2]} /></b></div>
              </div>
              <small>Delivery reserve included · CAD $9</small>
            </div>

            <section className="recipients">
              <div className="section-title"><span><b>Shopping for</b><small>3 people or groups</small></span><button aria-label="Add recipient">＋</button></div>
              <div className="recipient-row">
                <div><i className="peach">M</i><span><b>Mom</b><small>Local design</small></span></div>
                <div><i className="blue">F</i><span><b>Friends</b><small>2 gifts</small></span></div>
                <div><i className="yellow">L</i><span><b>Lab</b><small>Shareable</small></span></div>
              </div>
            </section>

            <button className="main-button" onClick={() => go("picks")}><span>Find gifts in budget<small>In-stock picks along one easy route</small></span><i>→</i></button>
          </div>
        )}

        {screen === "picks" && (
          <div className="screen picks-screen">
            <header className="detail-header"><button onClick={() => go("budget")} aria-label="Go back">←</button><span>Gift picks</span><i>{selected.length}</i></header>
            <div className="picks-intro"><div><p>CURATED FOR YOUR TRIP</p><h1>Three stops.<br /><em>Everyone covered.</em></h1></div><div className={remaining < 0 ? "balance over" : "balance"}><small>LEFT</small><b><Money value={remaining} /></b><span>of <Money value={budget} /></span></div></div>

            <div className="route-card"><div className="route-track"><i>YOU</i><span /><i>1</i><span /><i>2</i><span /><i>3</i><span /><i className="drop-pin">DROP</i></div><b>1.2 km · 1 hr 40 min</b><small>Ends at your bag-drop partner</small></div>

            <div className="gift-list">
              {gifts.map((gift) => {
                const checked = selectedIds.includes(gift.id);
                return <article className={checked ? "gift selected" : "gift"} key={gift.id}>
                  <div className={`gift-art ${gift.color}`}><span>{gift.symbol}</span></div>
                  <div className="gift-info"><small>{gift.for}</small><h2>{gift.name}</h2><p><b>{gift.store}</b> · {gift.area}</p><em>✦ {gift.reason}</em></div>
                  <div className="gift-buy"><b><Money value={gift.price} /></b><button onClick={() => toggleGift(gift.id)} aria-label={`${checked ? "Remove" : "Add"} ${gift.name}`}>{checked ? "✓" : "+"}</button></div>
                </article>;
              })}
            </div>

            <div className="checkout-bar"><span><small>{selected.length} gifts + delivery</small><b><Money value={total} /> total</b></span><button onClick={() => go("drop")} disabled={!selected.length || remaining < 0}>Shop this route →</button></div>
          </div>
        )}

        {screen === "drop" && (
          <div className="screen drop-screen">
            <header className="detail-header"><button onClick={() => go("picks")} aria-label="Go back">←</button><span>Bag drop</span><i>3</i></header>
            <div className="bag-visual" aria-hidden="true"><i>TRAIL</i><i>LOCAL</i><span>✓</span></div>
            <div className="drop-title"><p>SHOPPING COMPLETE</p><h1>Leave the bags.<br /><em>Keep the day.</em></h1><span>Bring all three bags to the final store. We will send them to your hotel together.</span></div>

            <div className="drop-pass"><div><span>BAG DROP PASS</span><b>TR–2718</b></div><div className="barcode" /><small>Show this screen at Blue Banana Market</small></div>

            <div className="drop-details">
              <div><i>⌂</i><span><small>Drop-off</small><b>Blue Banana Market</b></span><em>2 min</em></div>
              <div><i>⌖</i><span><small>Deliver to</small><b>The Annex Hotel</b></span><em>›</em></div>
              <div><i>◷</i><span><small>Arrival window</small><b>Today, 6:30–7:00 PM</b></span><em>$9</em></div>
            </div>

            <button className="main-button dark" onClick={() => { setDeliveryStep(1); go("tracking"); }}><span>I dropped off my bags<small>Start secure delivery tracking</small></span><i>→</i></button>
          </div>
        )}

        {screen === "tracking" && (
          <div className="screen tracking-screen">
            <header className="app-header light"><Brand /><button onClick={() => go("budget")}>Done</button></header>
            <div className="free-hands"><div><span>✦</span></div><p>BAGS ON THE MOVE</p><h1>{deliveryStep === 3 ? "Delivered to your hotel." : "Your hands are free."}</h1><span>{deliveryStep === 3 ? "Your bags are waiting safely at the front desk." : "Keep exploring. We will let you know the moment your bags arrive."}</span></div>

            <div className="tracking-card">
              <div className="tracking-head"><span>TR–2718 · 3 bags</span><b>{deliveryStep === 1 ? "Driver pickup" : deliveryStep === 2 ? "On the way" : "Delivered"}</b></div>
              <div className="tracking-line">
                {["Dropped", "Picked up", "On route", "At hotel"].map((label, index) => <div className={index <= deliveryStep ? "done" : ""} key={label}><i>{index < deliveryStep ? "✓" : ""}</i><span>{label}</span></div>)}
              </div>
              <div className="eta"><span>Estimated arrival</span><b>{deliveryStep === 3 ? "6:42 PM" : "6:30–7:00 PM"}</b></div>
              {deliveryStep < 3 && <button className="next-state" onClick={() => setDeliveryStep((current) => Math.min(3, current + 1))}>Preview next status →</button>}
            </div>

            <button className="explore-card"><span><small>1 HR 20 MIN, BAG-FREE</small><b>Walk to Graffiti Alley</b><em>8 min · On your way to the hotel</em></span><i>→</i></button>
          </div>
        )}

        <nav className={screen === "tracking" ? "tab-bar dark-tabs" : "tab-bar"} aria-label="Main navigation">
          {navItems.map((item) => <button key={item.screen} className={screen === item.screen ? "active" : ""} onClick={() => go(item.screen)}><i>{item.icon}</i><span>{item.label}</span></button>)}
        </nav>
        <div className="home-indicator" />
      </section>
    </main>
  );
}
