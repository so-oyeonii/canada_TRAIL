"use client";

import { useMemo, useState } from "react";

type Screen =
  | "welcome"
  | "home"
  | "shopping"
  | "budget"
  | "stores"
  | "route"
  | "drop"
  | "delivery"
  | "layover"
  | "time"
  | "decision"
  | "rest";

const journey = ["Discover", "Decide", "Shop", "Drop", "Explore", "Receive"];

const stores = [
  {
    name: "Spacing Store",
    area: "401 Richmond St W",
    distance: "7 min walk",
    category: "Canadian design",
    note: "Thoughtful home pieces for Mom, within the CAD 55 range.",
    color: "mint",
  },
  {
    name: "Blue Banana Market",
    area: "Kensington Market",
    distance: "9 min walk",
    category: "Local food & gifts",
    note: "One stop for your friends and shareable maple treats for the lab.",
    color: "coral",
  },
  {
    name: "Kid Icarus",
    area: "205 Augusta Ave",
    distance: "2 min walk",
    category: "Toronto-made prints",
    note: "A small, personal add-on that still keeps you under budget.",
    color: "blue",
  },
];

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

function Brand() {
  return (
    <div className="brand" aria-label="TRAIL">
      <span className="brand-mark">T</span>
      <span>TRAIL</span>
    </div>
  );
}

function TopBar({ title, onBack, action }: { title?: string; onBack?: () => void; action?: React.ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="icon-button" onClick={onBack} aria-label="Go back">←</button>
      ) : <Brand />}
      {title && <strong className="topbar-title">{title}</strong>}
      <div className="topbar-action">{action}</div>
    </header>
  );
}

function PrimaryButton({ children, onClick, light = false }: { children: React.ReactNode; onClick: () => void; light?: boolean }) {
  return <button className={`primary-button${light ? " light" : ""}`} onClick={onClick}>{children}<span>→</span></button>;
}

function AiNote({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`ai-note${dark ? " dark" : ""}`}>
      <Glyph>✦</Glyph>
      <p>{children}</p>
    </div>
  );
}

function Progress({ active }: { active: number }) {
  return (
    <div className="journey-strip" aria-label="Journey progress">
      {journey.map((item, index) => (
        <span key={item} className={index <= active ? "active" : ""}>{item}</span>
      ))}
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [deliveryStep, setDeliveryStep] = useState(1);
  const [selectedDecision, setSelectedDecision] = useState<"shop" | "rest" | "visit">("shop");

  const back: Record<Screen, Screen> = useMemo(() => ({
    welcome: "welcome",
    home: "welcome",
    shopping: "home",
    budget: "shopping",
    stores: "budget",
    route: "stores",
    drop: "route",
    delivery: "drop",
    layover: "home",
    time: "layover",
    decision: "time",
    rest: "decision",
  }), []);

  const goBack = () => setScreen(back[screen]);

  return (
    <main className="site-shell">
      <div className="ambient-route" aria-hidden="true">
        <span>YYZ</span><i></i><span>TOR</span><i></i><span>TRAIL</span>
      </div>
      <section className="phone" aria-live="polite">
        <div className={`screen screen-${screen}`} key={screen}>

          {screen === "welcome" && (
            <div className="welcome-screen">
              <div className="welcome-top"><Brand /><span className="local-chip">Toronto · 14:10</span></div>
              <div className="compass-hero" aria-hidden="true">
                <div className="orbit orbit-one"><span>SHOP</span></div>
                <div className="orbit orbit-two"><span>REST</span></div>
                <div className="compass-core"><b>3h</b><small>usable time</small></div>
              </div>
              <div className="welcome-copy">
                <p className="eyebrow">Your context-aware travel companion</p>
                <h1>Travel lighter.<br /><em>Decide smarter.</em></h1>
                <p>TRAIL turns your location, time and priorities into one realistic next move.</p>
              </div>
              <div className="welcome-actions">
                <PrimaryButton onClick={() => setScreen("home")} light>Start with my context</PrimaryButton>
                <p>Discover · Decide · Shop · Drop · Explore · Receive</p>
              </div>
            </div>
          )}

          {screen === "home" && (
            <>
              <TopBar action={<button className="location-button">Toronto⌄</button>} />
              <div className="content home-content">
                <p className="eyebrow">Tuesday, 12 August</p>
                <h1>Where should we<br /><em>take you next?</em></h1>
                <div className="context-ribbon">
                  <div><span className="live-dot"></span><b>Downtown Toronto</b><small>Current location</small></div>
                  <div><b>3h 00m</b><small>Available</small></div>
                </div>
                <div className="action-grid">
                  <button className="action-card main-action" onClick={() => setScreen("shopping")}>
                    <Glyph>✦</Glyph><span><b>Plan with AI</b><small>A realistic plan for right now</small></span><i>→</i>
                  </button>
                  <button className="action-card" onClick={() => setScreen("shopping")}>
                    <Glyph>◇</Glyph><span><b>Find gifts</b><small>Personal picks, nearby</small></span>
                  </button>
                  <button className="action-card dark-card" onClick={() => setScreen("layover")}>
                    <Glyph>↗</Glyph><span><b>Layover help</b><small>Know your real time window</small></span>
                  </button>
                  <button className="action-card wide-action" onClick={() => { setSelectedDecision("rest"); setScreen("rest"); }}>
                    <Glyph>◒</Glyph><span><b>Find a place to rest</b><small>Matched to your time and comfort</small></span><i>→</i>
                  </button>
                </div>
                <AiNote>You can comfortably fit a focused gift run before dinner. I’ll keep the route under 2 hours.</AiNote>
              </div>
            </>
          )}

          {screen === "shopping" && (
            <>
              <TopBar title="AI shopping plan" onBack={goBack} />
              <div className="content">
                <div className="title-block"><p className="eyebrow">Decision setup</p><h2>Tell me what<br />matters today.</h2></div>
                <div className="decision-card">
                  <label><span>⌖</span><div><small>Current location</small><input aria-label="Current location" defaultValue="Toronto, ON" /></div></label>
                  <label><span>◷</span><div><small>Available time</small><input aria-label="Available time" defaultValue="3 hours" /></div></label>
                  <label><span>¤</span><div><small>Total gift budget</small><input aria-label="Gift budget" defaultValue="CAD 200" /></div></label>
                </div>
                <div className="form-section">
                  <div className="section-label"><b>Who are you shopping for?</b><span>4 groups</span></div>
                  <div className="chip-row"><button className="choice-chip selected">Mother</button><button className="choice-chip selected">2 friends</button><button className="choice-chip selected">Lab members</button></div>
                </div>
                <div className="form-section">
                  <div className="section-label"><b>Preferences</b></div>
                  <div className="preference-list"><span>Local design</span><span>Food to share</span><span>Easy to pack</span></div>
                </div>
                <AiNote>I’ll balance meaning, group size and packing ease—not just split the budget evenly.</AiNote>
              </div>
              <div className="bottom-action"><PrimaryButton onClick={() => setScreen("budget")}>Build my gift plan</PrimaryButton></div>
            </>
          )}

          {screen === "budget" && (
            <>
              <TopBar title="Gift plan" onBack={goBack} />
              <div className="content">
                <Progress active={1} />
                <div className="budget-hero">
                  <span>Total gift budget</span><b>CAD 200</b><small>CAD 10 kept as flexibility</small>
                </div>
                <h2 className="section-heading">A balanced split</h2>
                <div className="budget-list">
                  <div><i className="avatar mother">M</i><span><b>Mother</b><small>Local design · thoughtful</small></span><strong>$55</strong></div>
                  <div><i className="avatar friends">F</i><span><b>Two friends</b><small>Useful · easy to pack</small></span><strong>$70</strong></div>
                  <div><i className="avatar lab">L</i><span><b>Lab members</b><small>Food · easy to share</small></span><strong>$65</strong></div>
                </div>
                <div className="budget-bar"><i style={{width:"29%"}}></i><i style={{width:"37%"}}></i><i style={{width:"34%"}}></i></div>
                <AiNote>This split considers your total budget, each relationship, preferences and the size of each recipient group.</AiNote>
              </div>
              <div className="bottom-action"><PrimaryButton onClick={() => setScreen("stores")}>See 3 matched stores</PrimaryButton></div>
            </>
          )}

          {screen === "stores" && (
            <>
              <TopBar title="Nearby matches" onBack={goBack} action={<span className="tiny-badge">3 picks</span>} />
              <div className="content no-bottom-pad">
                <Progress active={1} />
                <div className="title-row"><div><p className="eyebrow">Shortlist, not a catalogue</p><h2>Right for you,<br />right now.</h2></div><div className="map-pin">⌖<small>1.2 km</small></div></div>
                <div className="store-list">
                  {stores.map((store, index) => (
                    <button className="store-card" key={store.name} onClick={() => setScreen("route")}>
                      <div className={`store-visual ${store.color}`}><span>0{index + 1}</span><i></i></div>
                      <div className="store-copy"><small>{store.category}</small><b>{store.name}</b><p>{store.note}</p><div><span>{store.distance}</span><span>{store.area}</span></div></div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bottom-action floating"><PrimaryButton onClick={() => setScreen("route")}>Build the efficient route</PrimaryButton></div>
            </>
          )}

          {screen === "route" && (
            <>
              <TopBar title="Shopping route" onBack={goBack} />
              <div className="route-map">
                <div className="street s1"></div><div className="street s2"></div><div className="street s3"></div>
                <div className="route-line"></div>
                <span className="route-point p0">YOU</span><span className="route-point p1">1</span><span className="route-point p2">2</span><span className="route-point p3">3</span>
                <span className="map-label l1">Queen St W</span><span className="map-label l2">Kensington</span>
              </div>
              <div className="route-sheet">
                <div className="route-summary"><div><p className="eyebrow">Your efficient loop</p><h2>1h 42m</h2></div><div><b>1.2 km</b><small>total walking</small></div></div>
                <div className="route-timeline">
                  <div><i>1</i><span><b>Spacing Store</b><small>14:20 · Shop for Mom · 25 min</small></span></div>
                  <div className="movement"><i></i><span>7 min walk</span></div>
                  <div><i>2</i><span><b>Blue Banana Market</b><small>14:52 · Friends + lab · 35 min</small></span></div>
                  <div className="movement"><i></i><span>2 min walk</span></div>
                  <div><i>3</i><span><b>Kid Icarus</b><small>15:29 · Optional add-on · 18 min</small></span></div>
                </div>
                <AiNote>The route ends at a participating TRAIL store, so your bags can continue without you.</AiNote>
                <PrimaryButton onClick={() => setScreen("drop")}>I’ve finished shopping</PrimaryButton>
              </div>
            </>
          )}

          {screen === "drop" && (
            <>
              <TopBar title="Bag drop" onBack={goBack} />
              <div className="content drop-content">
                <Progress active={3} />
                <div className="bag-illustration" aria-hidden="true"><div className="bag bag-one">TRAIL</div><div className="bag bag-two">LOCAL</div><span>✓</span></div>
                <div className="center-title"><p className="eyebrow">Purchase complete</p><h2>Leave the bags.<br /><em>Keep the day.</em></h2><p>Your purchases will travel to your designated destination while you continue exploring.</p></div>
                <div className="drop-details">
                  <div><span>◇</span><p><small>Purchased items</small><b>3 shopping bags</b></p></div>
                  <div><span>⌂</span><p><small>Participating store</small><b>Blue Banana Market</b></p></div>
                  <div><span>⌖</span><p><small>Delivery destination</small><b>The Annex Hotel</b></p><button aria-label="Change destination">›</button></div>
                </div>
              </div>
              <div className="bottom-action"><PrimaryButton onClick={() => { setDeliveryStep(1); setScreen("delivery"); }}>Leave my shopping bags</PrimaryButton></div>
            </>
          )}

          {screen === "delivery" && (
            <>
              <TopBar action={<button className="close-button" onClick={() => setScreen("home")}>Done</button>} />
              <div className="delivery-content">
                <div className="free-hands"><div className="sun-ring"><span>✦</span></div><p className="eyebrow">Drop confirmed</p><h1>Your hands are free.<br /><em>Continue exploring.</em></h1><p>It’s 15:48. You still have 1h 22m nearby before dinner.</p></div>
                <div className="delivery-card">
                  <div className="delivery-head"><span>Delivery to The Annex Hotel</span><b>{deliveryStep === 1 ? "In progress" : deliveryStep === 2 ? "Arriving soon" : "Delivered"}</b></div>
                  <div className="status-line">
                    {[0,1,2].map((step) => <i key={step} className={step <= deliveryStep ? "done" : ""}></i>)}
                  </div>
                  <div className="status-labels"><span>Left at store</span><span>On the way</span><span>At hotel</span></div>
                  {deliveryStep < 2 ? <button className="text-button" onClick={() => setDeliveryStep(deliveryStep + 1)}>Preview next delivery state →</button> : <p className="delivered-note">Your purchases have arrived at your designated location.</p>}
                </div>
                <button className="explore-card" onClick={() => setScreen("home")}><span><small>TRAIL suggests</small><b>Walk through Graffiti Alley</b><em>8 minutes from here · fits your time</em></span><i>→</i></button>
              </div>
            </>
          )}

          {screen === "layover" && (
            <>
              <TopBar title="Layover assistance" onBack={goBack} />
              <div className="content">
                <div className="airport-code"><div><span>YYZ</span><small>Toronto Pearson</small></div><i>→</i><div><span>NRT</span><small>Tokyo Narita</small></div></div>
                <div className="title-block"><p className="eyebrow">Connection context</p><h2>What can I<br />realistically do?</h2></div>
                <div className="decision-card airport-form">
                  <label><span>◷</span><div><small>Layover duration</small><input aria-label="Layover duration" defaultValue="6 hours" /></div></label>
                  <label><span>△</span><div><small>Departure</small><input aria-label="Departure terminal" defaultValue="Terminal 1 · 20:10" /></div></label>
                  <label><span>◎</span><div><small>Travel situation</small><input aria-label="Travel situation" defaultValue="International · carry-on" /></div></label>
                </div>
                <div className="form-section"><div className="section-label"><b>What would feel best?</b></div><div className="chip-row"><button className="choice-chip selected">Shop</button><button className="choice-chip">Rest</button><button className="choice-chip">Short visit</button></div></div>
                <AiNote>I’ll account for immigration, terminal movement, transport, security re-entry and boarding—not just the six hours on your ticket.</AiNote>
              </div>
              <div className="bottom-action"><PrimaryButton onClick={() => setScreen("time")}>Calculate my real window</PrimaryButton></div>
            </>
          )}

          {screen === "time" && (
            <>
              <TopBar title="Available time" onBack={goBack} />
              <div className="content">
                <div className="time-hero"><span>6h layover</span><b>2h 15m</b><small>realistically usable time</small></div>
                <div className="time-track">
                  <div className="segment immigration" style={{flex:55}}><span>Immigration</span><b>55m</b></div>
                  <div className="segment travel" style={{flex:45}}><span>Transport</span><b>45m</b></div>
                  <div className="segment activity" style={{flex:135}}><span>Your time</span><b>2h 15m</b></div>
                  <div className="segment security" style={{flex:65}}><span>Return + security</span><b>1h 05m</b></div>
                  <div className="segment boarding" style={{flex:60}}><span>Boarding buffer</span><b>1h</b></div>
                </div>
                <div className="clock-row"><span>14:10 now</span><span>19:10 gate</span><span>20:10 flight</span></div>
                <div className="safe-window">
                  <div className="safe-icon">✓</div><div><p className="eyebrow">TRAIL’s read</p><h3>Stay close to the airport.</h3><p>Downtown would leave too little margin. Airport shopping, a proper rest, or one nearby stop are realistic.</p></div>
                </div>
                <div className="context-checks"><span>✓ Immigration included</span><span>✓ Terminal 1 return</span><span>✓ Carry-on pace</span></div>
              </div>
              <div className="bottom-action"><PrimaryButton onClick={() => setScreen("decision")}>Compare realistic options</PrimaryButton></div>
            </>
          )}

          {screen === "decision" && (
            <>
              <TopBar title="Best use of your time" onBack={goBack} />
              <div className="content no-bottom-pad">
                <p className="eyebrow">Based on your 2h 15m window</p><h2 className="decision-title">Three realistic choices.<br /><em>One clear fit.</em></h2>
                <div className="option-list">
                  <button className={selectedDecision === "shop" ? "selected" : ""} onClick={() => setSelectedDecision("shop")}><i>◇</i><span><b>Shop locally, inside YYZ</b><small>Best fit · 75 min activity</small><em>Canadian gifts · duty-free · easy return</em></span><strong>✓</strong></button>
                  <button className={selectedDecision === "rest" ? "selected" : ""} onClick={() => setSelectedDecision("rest")}><i>◒</i><span><b>Rest before the flight</b><small>Very comfortable · 90 min</small><em>Lounge, quiet zone or 24-hour café</em></span><strong>✓</strong></button>
                  <button className={selectedDecision === "visit" ? "selected" : ""} onClick={() => setSelectedDecision("visit")}><i>⌖</i><span><b>Short nearby visit</b><small>Possible · tighter margin</small><em>One stop near the airport only</em></span><strong>✓</strong></button>
                </div>
                <AiNote dark>{selectedDecision === "shop" ? "Shop is the strongest fit: local products, no weather risk, and a generous return buffer." : selectedDecision === "rest" ? "Rest gives you the most comfort with the least movement before your overnight flight." : "A short visit is possible, but I’ll keep you within a 15-minute ride of Terminal 1."}</AiNote>
              </div>
              <div className="bottom-action"><PrimaryButton onClick={() => setScreen("rest")}>Show my suggested plan</PrimaryButton></div>
            </>
          )}

          {screen === "rest" && (
            <>
              <TopBar title="Suggested layover plan" onBack={goBack} />
              <div className="content no-bottom-pad">
                <div className="plan-hero"><p className="eyebrow">Toronto · Terminal 1</p><h2>{selectedDecision === "rest" ? "A calm reset," : selectedDecision === "visit" ? "One nearby stop," : "Local gifts,"}<br /><em>with room to move.</em></h2><p>Localized for YYZ opening hours, terminal layout and your carry-on pace.</p></div>
                <div className="mobility-banner"><div className="mobility-icon">↝</div><div><small>Mobility-aware route</small><b>12 min total walking</b><p>Indoor route · elevator access · no terminal transfer</p></div></div>
                <div className="suggested-timeline">
                  <div><time>15:10</time><i></i><span><b>{selectedDecision === "rest" ? "Plaza Premium Lounge" : selectedDecision === "visit" ? "UP Express to nearby stop" : "Distillery Collection"}</b><small>{selectedDecision === "rest" ? "Quiet seating · light meal · 65 min" : selectedDecision === "visit" ? "Single, weather-safe visit · 55 min" : "Canadian food gifts · near D gates · 30 min"}</small></span></div>
                  <div><time>16:20</time><i></i><span><b>{selectedDecision === "rest" ? "Terminal 1 quiet zone" : selectedDecision === "visit" ? "Return toward Terminal 1" : "Duty-free Canadian edit"}</b><small>{selectedDecision === "rest" ? "Low-traffic seating · 25 min" : selectedDecision === "visit" ? "Built-in transport buffer · 35 min" : "Three packable options · 25 min"}</small></span></div>
                  <div><time>17:05</time><i></i><span><b>Walk to security</b><small>Level 3 · elevator route · 8 min</small></span></div>
                  <div><time>19:10</time><i className="final"></i><span><b>Be at Gate D32</b><small>One-hour boarding buffer protected</small></span></div>
                </div>
                <div className="local-note"><span>YYZ</span><p><b>Why this plan is local</b><small>It reflects Terminal 1 distances, Canadian gift categories and Toronto transport timing—not a generic six-hour layover.</small></p></div>
                <PrimaryButton onClick={() => setScreen("home")}>Return to home</PrimaryButton>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
