"use client";

import { FormEvent, useMemo, useState } from "react";

type Screen = "home" | "chat" | "review" | "picks" | "drop" | "tracking";
type Message = { role: "ai" | "user"; text: string };
type Plan = {
  recipient: string;
  quantity: number;
  category: string;
  budget: number;
  preference: string;
  time: string;
  localOnly: boolean;
  easyPack: boolean;
  hotelDelivery: boolean;
};

const initialPlan: Plan = {
  recipient: "My mom",
  quantity: 1,
  category: "Home & design",
  budget: 80,
  preference: "Thoughtful and useful",
  time: "2 hours",
  localOnly: true,
  easyPack: true,
  hotelDelivery: true,
};

const starters = [
  { icon: "M", title: "A gift for my mom", prompt: "I want a thoughtful local gift for my mom under CAD 80." },
  { icon: "F", title: "Two equal gifts", prompt: "I need two different but equal-value gifts for my friends." },
  { icon: "T", title: "Treats for my team", prompt: "I need something easy to share with my 12-person lab team." },
];

const productTemplates = [
  { name: "Ontario stoneware tea set", store: "Spacing Store", price: 58, walk: "7 min", color: "peach", mark: "C", reason: "Local maker · compact box · made to last" },
  { name: "Toronto linen market tote", store: "Kid Icarus", price: 36, walk: "9 min", color: "blue", mark: "T", reason: "Useful every day · folds completely flat" },
  { name: "Maple chocolate collection", store: "Blue Banana", price: 29, walk: "2 min", color: "yellow", mark: "M", reason: "Toronto favorite · travel-safe packaging" },
];

function Brand() {
  return <div className="brand"><span>T</span><b>TRAIL</b></div>;
}

function Header({ title, back, action }: { title?: string; back?: () => void; action?: React.ReactNode }) {
  return <header className="app-header">{back ? <button className="round-button" onClick={back} aria-label="Go back">←</button> : <Brand />}{title && <b className="header-title">{title}</b>}<div className="header-action">{action}</div></header>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button className={on ? "toggle on" : "toggle"} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [approvedPlan, setApprovedPlan] = useState<Plan | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Hi, I’m Trail. Tell me who you’re shopping for and what would make the gift feel right." },
  ]);
  const [input, setInput] = useState("");
  const [deliveryStep, setDeliveryStep] = useState(1);

  const estimates = useMemo(() => {
    const stops = plan.budget < 60 ? 1 : plan.budget < 130 ? 2 : 3;
    return { stops, minutes: 35 + stops * 22, reserve: plan.hotelDelivery ? 9 : 0 };
  }, [plan.budget, plan.hotelDelivery]);

  const go = (next: Screen) => {
    setScreen(next);
    window.setTimeout(() => document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const inferPlan = (text: string) => {
    const lower = text.toLowerCase();
    setPlan((current) => {
      const next = { ...current };
      const amount = text.match(/(?:cad|\$)\s?(\d+)|(\d+)\s?(?:cad|dollars?)/i);
      if (amount) next.budget = Number(amount[1] || amount[2]);
      if (/mom|mother/.test(lower)) { next.recipient = "My mom"; next.quantity = 1; }
      if (/friend/.test(lower)) { next.recipient = "My friends"; next.quantity = /two|2/.test(lower) ? 2 : 1; }
      if (/team|lab|cowork/.test(lower)) { next.recipient = "My lab team"; next.quantity = 12; }
      if (/food|snack|chocolate|treat|share/.test(lower)) next.category = "Food & treats";
      if (/design|home|ceramic|useful/.test(lower)) next.category = "Home & design";
      if (/souvenir|local|toronto|canadian/.test(lower)) next.localOnly = true;
      if (/pack|carry|small|light/.test(lower)) next.easyPack = true;
      if (/no delivery|carry it|take it/.test(lower)) next.hotelDelivery = false;
      if (/hotel|deliver|hands.free/.test(lower)) next.hotelDelivery = true;
      if (/meaningful|thoughtful/.test(lower)) next.preference = "Thoughtful and personal";
      if (/practical|useful/.test(lower)) next.preference = "Practical and useful";
      return next;
    });
  };

  const sendMessage = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    inferPlan(clean);
    setMessages((current) => [...current, { role: "user", text: clean }, { role: "ai", text: "Got it. I’m shaping the budget, gift type, route, and delivery around that. Add anything else, or open the draft when it feels complete." }]);
    setInput("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage(input);
  };

  const startChat = (prompt?: string) => {
    go("chat");
    if (prompt) window.setTimeout(() => sendMessage(prompt), 50);
  };

  const updatePlan = <K extends keyof Plan>(key: K, value: Plan[K]) => setPlan((current) => ({ ...current, [key]: value }));

  const approvePlan = () => {
    setApprovedPlan({ ...plan });
    go("picks");
  };

  const activePlan = approvedPlan ?? plan;
  const products = productTemplates.map((item, index) => ({ ...item, price: Math.max(18, Math.round((activePlan.budget - estimates.reserve) * [.48, .31, .21][index])) }));

  return (
    <main className="stage">
      <section className="phone" aria-live="polite">
        <div className="status-bar"><span>9:41</span><div><i /><i /><b /></div></div>

        {screen === "home" && <div className="screen home-screen">
          <Header action={<button className="avatar" aria-label="Open profile">SY</button>} />
          <section className="home-hero"><div className="ai-orbit"><i>✦</i><span>AI gift planner</span></div><p>TORONTO · 3 HOURS FREE</p><h1>What do you want<br />to bring <em>home?</em></h1><span>Talk it through. Trail turns your idea into a budget, store route, and bag-delivery plan you can edit before approving.</span></section>

          <button className="ask-card" onClick={() => startChat()}><div className="trail-face">✦</div><span><small>ASK TRAIL</small><b>Describe the gift in your own words</b><em>“Something thoughtful for my mom under $80…”</em></span><i>→</i></button>

          <section className="starter-section"><div className="section-label"><b>Try a starting point</b><span>Tap to customize</span></div><div className="starter-list">{starters.map((item) => <button key={item.title} onClick={() => startChat(item.prompt)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.prompt}</small></span><em>›</em></button>)}</div></section>

          <section className="how-it-works"><b>One conversation, one ready plan</b><div><span><i>1</i>Tell Trail what matters</span><span><i>2</i>Edit the plan draft</span><span><i>3</i>Approve & shop</span></div></section>
        </div>}

        {screen === "chat" && <div className="screen chat-screen">
          <Header title="Ask Trail" back={() => go("home")} action={<button className="text-action" onClick={() => go("review")}>View draft</button>} />
          <div className="chat-status"><i>✦</i><span><b>Trail AI</b><small>Building your gift plan</small></span><em>LIVE</em></div>
          <div className="messages">{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.role === "ai" && <i>✦</i>}<p>{message.text}</p></div>)}</div>
          <div className="quick-replies"><button onClick={() => sendMessage("Keep it local and easy to pack.")}>Local + packable</button><button onClick={() => sendMessage("Please deliver the bags to my hotel.")}>Hotel delivery</button><button onClick={() => sendMessage("My total budget is CAD 80.")}>Budget $80</button></div>
          <div className="live-draft"><span><small>LIVE DRAFT</small><b>{plan.recipient} · {plan.category}</b></span><strong>${plan.budget}</strong><button onClick={() => go("review")}>Review →</button></div>
          <form className="chat-input" onSubmit={submit}><button type="button" aria-label="Add attachment">＋</button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tell Trail more…" aria-label="Message Trail" /><button type="submit" aria-label="Send message">↑</button></form>
        </div>}

        {screen === "review" && <div className="screen review-screen">
          <Header title="Plan draft" back={() => go("chat")} action={<span className="draft-badge">AI DRAFT</span>} />
          <div className="review-intro"><div className="spark">✦</div><span><p>READY TO REVIEW</p><h1>I built this around<br />what you told me.</h1><small>Change any detail. Recommendations update with your plan.</small></span></div>

          <div className="confidence"><span><b>6 details understood</b><small>Recipient, budget, type, time, packing, delivery</small></span><strong>92%</strong></div>

          <section className="settings-card">
            <label><span><small>SHOPPING FOR</small><input value={plan.recipient} onChange={(e) => updatePlan("recipient", e.target.value)} /></span><i>✎</i></label>
            <label><span><small>NUMBER OF GIFTS</small><input type="number" min="1" max="30" value={plan.quantity} onChange={(e) => updatePlan("quantity", Number(e.target.value))} /></span><i>✎</i></label>
            <label><span><small>GIFT TYPE</small><select value={plan.category} onChange={(e) => updatePlan("category", e.target.value)}><option>Home & design</option><option>Food & treats</option><option>Art & stationery</option><option>Open to ideas</option></select></span><i>⌄</i></label>
            <label><span><small>WHAT IT SHOULD FEEL LIKE</small><select value={plan.preference} onChange={(e) => updatePlan("preference", e.target.value)}><option>Thoughtful and personal</option><option>Thoughtful and useful</option><option>Practical and useful</option><option>Fun and distinctly local</option></select></span><i>⌄</i></label>
          </section>

          <section className="budget-editor"><div><span><small>TOTAL BUDGET</small><b>CAD ${plan.budget}</b></span><em>Includes ${estimates.reserve} delivery reserve</em></div><input type="range" min="40" max="300" step="10" value={plan.budget} onChange={(e) => updatePlan("budget", Number(e.target.value))} /><div className="range-values"><span>$40</span><span>$300</span></div></section>

          <section className="preferences"><div><span><b>Local makers only</b><small>Prioritize Toronto and Canadian brands</small></span><Toggle label="Local makers only" on={plan.localOnly} onChange={(v) => updatePlan("localOnly", v)} /></div><div><span><b>Easy to pack</b><small>Avoid fragile or bulky items</small></span><Toggle label="Easy to pack" on={plan.easyPack} onChange={(v) => updatePlan("easyPack", v)} /></div><div><span><b>Deliver bags to hotel</b><small>Drop everything at the final store</small></span><Toggle label="Hotel delivery" on={plan.hotelDelivery} onChange={(v) => updatePlan("hotelDelivery", v)} /></div></section>

          <div className="plan-impact"><div><i>⌖</i><span><small>ROUTE</small><b>{estimates.stops} stores · {estimates.minutes} min</b></span></div><div><i>◇</i><span><small>RESULT</small><b>{Math.max(3, plan.quantity)} matched picks</b></span></div></div>
          <button className="main-button" onClick={approvePlan}><span>Approve & build my plan<small>You can still change products afterwards</small></span><i>→</i></button>
          <button className="back-to-chat" onClick={() => go("chat")}>Keep talking to Trail</button>
        </div>}

        {screen === "picks" && <div className="screen picks-screen">
          <Header title="Your plan" back={() => go("review")} action={<button className="text-action" onClick={() => go("review")}>Edit</button>} />
          <div className="approved-banner"><i>✓</i><span><small>PLAN APPROVED</small><b>{activePlan.recipient} · ${activePlan.budget}</b></span></div>
          <div className="result-title"><p>TRAIL’S BEST MATCH</p><h1>{activePlan.category}<br /><em>picked for you.</em></h1><span>{activePlan.preference}. {activePlan.easyPack ? "All picks are easy to pack." : "A mix of sizes is included."}</span></div>
          <div className="result-route"><div><i>YOU</i><span /><i>1</i><span /><i>2</i><span /><i>DROP</i></div><b>{estimates.minutes} min · {estimates.stops} focused stops</b><small>Ends where bag delivery starts</small></div>
          <div className="product-list">{products.map((item, index) => <article key={item.name}><div className={`product-art ${item.color}`}>{item.mark}</div><div><small>OPTION 0{index + 1}</small><h2>{item.name}</h2><p><b>{item.store}</b> · {item.walk}</p><em>✦ {item.reason}</em></div><strong>${item.price}</strong></article>)}</div>
          <button className="main-button dark" onClick={() => go("drop")}><span>Start this shopping plan<small>{activePlan.hotelDelivery ? "Bag drop included at the final store" : "Carry purchases with you"}</small></span><i>→</i></button>
        </div>}

        {screen === "drop" && <div className="screen drop-screen">
          <Header title="Bag drop" back={() => go("picks")} action={<span className="draft-badge">3 BAGS</span>} />
          <div className="bag-visual"><i>TRAIL</i><i>LOCAL</i><span>✓</span></div><div className="drop-copy"><p>SHOPPING COMPLETE</p><h1>Leave the bags.<br /><em>Keep the day.</em></h1><span>Your approved plan ends at Blue Banana Market. Show the pass and leave every bag together.</span></div>
          <div className="drop-pass"><div><span>BAG DROP PASS</span><b>TR–2718</b></div><div className="barcode" /><small>Deliver to The Annex Hotel · CAD $9</small></div>
          <button className="main-button dark" onClick={() => { setDeliveryStep(1); go("tracking"); }}><span>I dropped off my bags<small>Start secure delivery tracking</small></span><i>→</i></button>
        </div>}

        {screen === "tracking" && <div className="screen tracking-screen">
          <Header action={<button className="text-action light" onClick={() => go("home")}>Done</button>} />
          <div className="free-hands"><div>✦</div><p>BAGS ON THE MOVE</p><h1>{deliveryStep === 3 ? "Delivered to your hotel." : "Your hands are free."}</h1><span>{deliveryStep === 3 ? "Your bags are waiting safely at the front desk." : "Keep exploring. Trail will tell you when they arrive."}</span></div>
          <div className="tracking-card"><div><span>TR–2718 · 3 bags</span><b>{deliveryStep === 1 ? "Driver pickup" : deliveryStep === 2 ? "On the way" : "Delivered"}</b></div><section>{["Dropped", "Picked up", "On route", "At hotel"].map((label, index) => <span className={index <= deliveryStep ? "done" : ""} key={label}><i>{index < deliveryStep ? "✓" : ""}</i><small>{label}</small></span>)}</section><footer><span>Estimated arrival</span><b>{deliveryStep === 3 ? "6:42 PM" : "6:30–7:00 PM"}</b></footer>{deliveryStep < 3 && <button onClick={() => setDeliveryStep((value) => Math.min(3, value + 1))}>Preview next status →</button>}</div>
        </div>}

        <nav className={screen === "tracking" ? "tab-bar dark-tabs" : "tab-bar"}><button className={screen === "home" ? "active" : ""} onClick={() => go("home")}><i>⌂</i><span>Home</span></button><button className={screen === "chat" ? "active" : ""} onClick={() => go("chat")}><i>✦</i><span>Ask AI</span></button><button className={screen === "review" || screen === "picks" ? "active" : ""} onClick={() => go(approvedPlan ? "picks" : "review")}><i>⌁</i><span>Plan</span></button><button className={screen === "tracking" ? "active" : ""} onClick={() => go("tracking")}><i>⌖</i><span>Track</span></button></nav>
        <div className="home-indicator" />
      </section>
    </main>
  );
}
