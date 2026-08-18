import type { Survey } from "./types";

/** The internal alignment instrument. Mirrors docs/surveys/TEAM_BUILD_SURVEY.md.
 *
 *  The headline measure is `status` — the same fifteen build items judged by
 *  everyone, from memory, without opening the docs. Agreement is the finding;
 *  the mean is meaningless. A team that cannot agree on what already works is
 *  not disagreeing about priorities, it is building two different products.
 *
 *  Which is why this survey stores nothing that identifies a respondent, not
 *  even the role→answer join that a small team makes re-identifying trivial:
 *  `role` is asked, but §9 exists only because the answers cannot be traced. */

const AGREE = { min: 1, max: 7, low: "Strongly disagree", high: "Strongly agree" } as const;

const STATUS = [
  { value: "works", label: "Works — you could use it right now" },
  { value: "unwired", label: "Code exists, not wired to a screen" },
  { value: "designonly", label: "Design or docs only" },
  { value: "none", label: "Nothing there" },
  { value: "unknown", label: "Do not know" },
];

const BUILD_ITEMS = [
  { id: "p01", label: "Trip → recipients → budget split is saved on the server" },
  { id: "p02", label: "Trail AI chat turns into a structured brief" },
  { id: "p03", label: "The store names the AI says are real stores" },
  { id: "p04", label: "Going over budget hits an approval gate enforced by DB permissions" },
  { id: "p05", label: "Recording a purchase in a store moves actual spend" },
  { id: "p06", label: "The map tab runs on a real map and real routing" },
  { id: "p07", label: "Delivery payment moves real money" },
  { id: "p08", label: "Delivery status advances by itself, not by hand" },
  { id: "p09", label: "The QR and tag procedure at a partner store exists in code" },
  { id: "p10", label: "The QR pass works offline (airplane mode)" },
  { id: "p11", label: "Sign-in actually works" },
  { id: "p12", label: "The app is deployed at a public URL" },
  { id: "p13", label: "At least one partner store is signed" },
  { id: "p14", label: "At least one hotel is signed" },
  { id: "p15", label: "At least one delivery has actually been completed" },
];

const WORK_ITEMS = [
  { id: "deploy", label: "A. Public deploy — what we have, open at a URL" },
  { id: "catalog", label: "B. Real store and product catalog (kills AI invention)" },
  { id: "map", label: "C. Build the map tab for real" },
  { id: "pwa", label: "D. Web app (PWA) + offline QR pass" },
  { id: "custody", label: "E. Partner custody write path" },
  { id: "payment", label: "F. Real payment integration" },
  { id: "partner", label: "G. Sign one partner store and one hotel" },
  { id: "delivery1", label: "H. Run one real delivery" },
  { id: "polish", label: "I. UI finish and design cleanup" },
  { id: "qa", label: "J. Testing, stabilising, bugs" },
];

export const teamSurvey: Survey = {
  key: "team",
  title: "TRAIL internal check",
  lede: "Before we turn the wireframes into a working product, a check on whether we are all looking at the same thing.",
  minutes: "About 13 minutes",
  anonymity: "Fully anonymous. No name, email or IP address is stored.",
  intro: [
    "This is for alignment, not appraisal. Nobody is looking for who did not do what.",
    "The second screen is the one that matters. Do not open the docs — answer from memory. If you do not know, \"do not know\" is the right answer.",
    "Results go to the team as the raw numbers and the raw text, not as a summary.",
  ],
  closing: "Thank you. The tally goes to the team, unedited, the day after the deadline.",
  screenedOutMessage: "Thank you for answering.",

  sections: [
    {
      id: "consent",
      title: "Before you start",
      note: "Nothing that identifies you is stored with these answers. Role is asked, but results are shared by role in aggregate, never as one response next to its role.",
      questions: [
        { id: "consent", kind: "consent", prompt: "Understood.", label: "I agree to answer anonymously and start" },
      ],
    },

    {
      id: "background",
      title: "About you",
      questions: [
        { id: "r1", kind: "multi", prompt: "What have you mainly been doing on this project?", choices: [
          { value: "product", label: "Product and planning" }, { value: "design", label: "Design" }, { value: "frontend", label: "Front-end" },
          { value: "backend", label: "Backend and platform" }, { value: "ai", label: "AI and prompts" }, { value: "biz", label: "Business and pitch" },
          { value: "qa", label: "QA and review" }, { value: "other", label: "Something else" } ] },
        { id: "r2", kind: "single", prompt: "Over the next four weeks, how many hours a week can you really put into this?", choices: [
          { value: "u5", label: "Under 5 hours" }, { value: "5-10", label: "5–10 hours" }, { value: "10-20", label: "10–20 hours" },
          { value: "20-35", label: "20–35 hours" }, { value: "o35", label: "35 hours or more" } ] },
        { id: "r3", kind: "scale", prompt: "How certain is that number?", min: 1, max: 7, low: "Not certain at all", high: "Completely certain" },
        { id: "r4", kind: "single", prompt: "Have you actually changed code or docs in the last two weeks?", choices: [
          { value: "yes", label: "Yes" }, { value: "no", label: "No" } ] },
      ],
    },

    {
      id: "what",
      title: "What we are building",
      questions: [
        { id: "w1", kind: "single", prompt: "Where does TRAIL get paid?", choices: [
          { value: "ai", label: "AI shopping plans" }, { value: "delivery", label: "Store → hotel bag transfer" },
          { value: "storefee", label: "Store commission" }, { value: "hotel", label: "Hotel partnerships" }, { value: "undecided", label: "Not decided yet" } ] },
        { id: "w2", kind: "text", long: true, prompt: "A judge asks \"so what does this company actually do?\" — what is your one sentence?" },
      ],
    },

    {
      id: "status",
      title: "What actually works right now",
      note: "Do not open the docs. Judge from memory. If you do not know, \"do not know\" is the right answer. This is not scored for accuracy — the point is to find where our judgements split.",
      questions: [
        { id: "status", kind: "grid", prompt: "Pick the current state of each item.", rows: BUILD_ITEMS, choices: STATUS },
        { id: "status_verified", kind: "single", prompt: "How many of those fifteen have you checked yourself?", choices: [
          { value: "0", label: "None" }, { value: "1-3", label: "1–3" }, { value: "4-7", label: "4–7" },
          { value: "8-11", label: "8–11" }, { value: "12+", label: "12 or more" } ] },
      ],
    },

    {
      id: "priority",
      title: "What to build in the next four weeks",
      note: "The total has to be exactly 100 to continue. Zero is a fine score to give.",
      questions: [
        { id: "points", kind: "points", total: 100, prompt: "Split 100 points across these.", rows: WORK_ITEMS },
        { id: "must", kind: "multi", max: 3, prompt: "Pick up to three that the demo does not work without.", choices: WORK_ITEMS.map((i) => ({ value: i.id, label: i.label })) },
        { id: "waste", kind: "multi", prompt: "Is any of this a waste of time right now?", choices: [
          ...WORK_ITEMS.map((i) => ({ value: i.id, label: i.label })), { value: "none", label: "None of it", exclusive: true } ] },
        { id: "waste_why", kind: "text", long: true, showIf: { q: "waste", has: WORK_ITEMS.map((i) => i.id) }, prompt: "Why?" },
      ],
    },

    {
      id: "confidence",
      title: "Confidence and blockers",
      questions: [
        { id: "cf1", kind: "matrix", prompt: "How confident are you that each of these is finished by demo day?", min: 0, max: 10, low: "Not at all", high: "Certain", na: "Do not know", rows: [
          { id: "deploy", label: "Public deploy" }, { id: "catalog", label: "Real data catalog" }, { id: "pwa", label: "Offline QR pass" },
          { id: "map", label: "Map tab" }, { id: "partner", label: "One partner signed" }, { id: "delivery1", label: "One real delivery" } ] },
        { id: "cf2", kind: "scale", prompt: "How confident are you that your own part lands on time?", min: 0, max: 10, low: "Not at all", high: "Certain" },
        { id: "cf3", kind: "multi", showIf: { q: "cf2", has: ["0", "1", "2", "3", "4", "5", "6"] }, prompt: "Why is that?", choices: [
          { value: "time", label: "Not enough time" }, { value: "hard", label: "Technically hard" }, { value: "unclear", label: "Requirements are unclear" },
          { value: "blocked", label: "Waiting on someone else's work" }, { value: "external", label: "Waiting on something outside (contract, API, review)" },
          { value: "lost", label: "I do not know what to do" }, { value: "other", label: "Something else" } ] },
        { id: "cf4", kind: "text", long: true, optional: true, prompt: "Is anything of yours stuck waiting on someone else? What are you waiting for?", placeholder: "Optional" },
        { id: "cf5", kind: "text", long: true, optional: true, prompt: "The other way round: is anything of yours holding someone else up?", placeholder: "This is anonymous — say it plainly · Optional" },
      ],
    },

    {
      id: "decisions",
      title: "Still undecided",
      note: "We would like to settle these now. Pick your view on each.",
      questions: [
        { id: "dc1", kind: "single", prompt: "Sign-in", choices: [
          { value: "magic", label: "Keep the magic link" }, { value: "oauth", label: "Add OAuth (Google and the like)" },
          { value: "anon", label: "Anonymous session, upgrade later" }, { value: "any", label: "No preference" } ] },
        { id: "dc2", kind: "single", prompt: "AI memory default", choices: [
          { value: "on", label: "On (opt-out)" }, { value: "off", label: "Off (opt-in)" }, { value: "any", label: "No preference" } ] },
        { id: "dc3", kind: "single", prompt: "Currency", choices: [
          { value: "cad", label: "Fixed to CAD" }, { value: "derive", label: "Derived from the destination" }, { value: "any", label: "No preference" } ] },
        { id: "dc4", kind: "single", prompt: "In the demo, how should delivery status advance?", choices: [
          { value: "manual", label: "A person taps it forward (today)" }, { value: "sim", label: "A simulator advances it" },
          { value: "partner", label: "A real partner advances it" } ] },
        { id: "dc5", kind: "single", prompt: "With no real store or product data, what should the AI do?", choices: [
          { value: "silent", label: "Never name a store at all" }, { value: "labelled", label: "Name it, marked as an example" },
          { value: "asis", label: "Carry on as it does now" } ] },
        { id: "dc6", kind: "multi", prompt: "Which of those five do you want the call on?", choices: [
          { value: "dc1", label: "Sign-in" }, { value: "dc2", label: "AI memory" }, { value: "dc3", label: "Currency" },
          { value: "dc4", label: "Delivery status" }, { value: "dc5", label: "What the AI may name" }, { value: "none", label: "None of them", exclusive: true } ] },
      ],
    },

    {
      id: "constitution",
      title: "Are the product rules actually holding",
      note: "The six product rules from CLAUDE.md. How confident are you that the code really holds to each?",
      questions: [
        { id: "gates", kind: "matrix", prompt: "Confidence in each rule", ...AGREE, na: "Do not know", rows: [
          { id: "approval", label: "Budget changes, purchases, replacements and delivery are always approved by the user" },
          { id: "request", label: "Request is a stock enquiry, not an order (copy on screen included)" },
          { id: "sample", label: "Anything that is not live data carries a Sample or Simulated mark" },
          { id: "failures", label: "All four failure branches are alive" },
          { id: "cents", label: "Money is integer cents and the wallet identity is enforced by the DB" },
          { id: "ledger", label: "Ledgers are append-only and identity is read only on the server" } ] },
        { id: "broken", kind: "text", long: true, optional: true, prompt: "Do you think any of those is broken right now? Where?", placeholder: "Optional" },
        { id: "first_to_go", kind: "single", prompt: "If the schedule tightens, which rule gets compromised first?", choices: [
          { value: "approval", label: "User approval" }, { value: "request", label: "Request is only an enquiry" }, { value: "sample", label: "Sample and Simulated marks" },
          { value: "failures", label: "The failure branches" }, { value: "cents", label: "Money and the wallet identity" }, { value: "ledger", label: "Append-only ledgers" },
          { value: "none", label: "None of them will be" } ] },
      ],
    },

    {
      id: "demo",
      title: "The demo",
      questions: [
        { id: "dm1", kind: "multi", prompt: "Pick every stretch you could demo in front of judges without getting stuck.", choices: [
          { value: "onboarding", label: "Onboarding" }, { value: "chat", label: "AI chat" }, { value: "review", label: "Plan review" },
          { value: "people", label: "Recipients and allocation" }, { value: "approval", label: "Over-budget approval" }, { value: "purchase", label: "Recording a purchase" },
          { value: "arrange", label: "Requesting the delivery" }, { value: "pay", label: "Payment" }, { value: "drop", label: "QR drop-off" }, { value: "track", label: "Delivery tracking" } ] },
        { id: "dm2", kind: "single", prompt: "Which stretch is most likely to break mid-demo?", choices: [
          { value: "onboarding", label: "Onboarding" }, { value: "chat", label: "AI chat" }, { value: "review", label: "Plan review" },
          { value: "people", label: "Recipients and allocation" }, { value: "approval", label: "Over-budget approval" }, { value: "purchase", label: "Recording a purchase" },
          { value: "arrange", label: "Requesting the delivery" }, { value: "pay", label: "Payment" }, { value: "drop", label: "QR drop-off" }, { value: "track", label: "Delivery tracking" } ] },
        { id: "dm3", kind: "multi", prompt: "Where should we say out loud \"this part is simulated\"?", choices: [
          { value: "chat", label: "AI chat (stores and products)" }, { value: "map", label: "Map and route" }, { value: "pay", label: "Payment" },
          { value: "drop", label: "QR drop-off and tags" }, { value: "track", label: "Delivery tracking" }, { value: "none", label: "Nowhere", exclusive: true } ] },
        { id: "dm4", kind: "text", long: true, prompt: "Write the one judge question we would have the most trouble answering." },
      ],
    },

    {
      id: "risk",
      title: "Risk",
      note: "Rate each one 1–5 for how likely it is, and 1–5 for how much it hurts if it lands.",
      questions: [
        { id: "risks", kind: "dual", prompt: "Likelihood × impact", left: "Likelihood", right: "Impact", min: 1, max: 5, rows: [
          { id: "nopartner", label: "We sign no partner store at all" },
          { id: "hotelrefuse", label: "Hotels refuse to take the bags" },
          { id: "hallucination", label: "With no real data, the AI keeps inventing stores" },
          { id: "build", label: "The build or a migration breaks right before deploy" },
          { id: "people", label: "Key people cannot find the time" },
          { id: "liability", label: "Nobody owns the liability when a bag is lost or damaged" },
          { id: "privacy", label: "A personal data or payment problem" } ] },
        { id: "risk_other", kind: "text", long: true, optional: true, prompt: "Is the thing you are most afraid of missing from that list?", placeholder: "Optional" },
        { id: "risk_mitigation", kind: "text", long: true, prompt: "For the risk you rated worst, write one thing we could do about it in the next two weeks." },
      ],
    },

    {
      id: "team",
      title: "The team",
      questions: [
        { id: "tm", kind: "matrix", prompt: "How much do you agree?", ...AGREE, rows: [
          { id: "clear", label: "It is clear what I should be doing right now" },
          { id: "safe", label: "It is easy to speak up when I find a problem" },
          { id: "decided", label: "Things that need deciding get decided in time" },
          { id: "feedback", label: "Someone gives me feedback on what I make" },
          { id: "pace", label: "At this pace we make demo day" },
          { id: "sustainable", label: "This level of effort is sustainable" } ] },
        { id: "unsaid", kind: "text", long: true, prompt: "Write one thing you think is a problem that nobody is saying.", placeholder: "This one question is why the survey is anonymous." },
        { id: "one_thing", kind: "text", long: true, prompt: "If the team does exactly one thing in the next two weeks, what is it?" },
      ],
    },
  ],
};
