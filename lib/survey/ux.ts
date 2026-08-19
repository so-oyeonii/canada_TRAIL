import type { Survey } from "./types";

/** The prototype usability instrument. Mirrors docs/surveys/UX_SURVEY.md; that
 *  file keeps the analysis notes and failure thresholds, this one keeps only
 *  what a respondent sees.
 *
 *  **What is measured changed.** v1 showed the wireframes of the app in this
 *  repository. v2 shows the Figma prototype at reach-extra-11429501.figma.site,
 *  which is a different product: four tabs (Home · Gifts · Wishlist · Bags), a
 *  proximity card, a ranked recipient list, a saved-items list, and one budget
 *  line instead of a three-bucket wallet. It has no onboarding, no map, no pay
 *  screen, no `Request` button and no approval screen, so nothing here asks a
 *  respondent to find those.
 *
 *  Every question whose evidence is a screen carries a **new id**. Old ids are
 *  not reused: the same words over different screens are a different variable,
 *  and pooling them would be an error nobody could see in the export. Kept on
 *  purpose — `consent`, the screener, demographics, `b1`/`b2`, the failure
 *  scenarios `f1`–`f5`, `umux`, `trust`, `nps` and the closing text items. Those
 *  are either stimulus-free or standard instruments meant to be read across
 *  versions, which is the whole point of a benchmark.
 *
 *  Scored right/wrong rather than rated, and the reason the study exists:
 *    • `mo_left` / `mo_free` / `mo_fee` — the budget line either says what is
 *      left, what is unassigned, and where the delivery fee sits, or it does
 *      not. A Likert item cannot tell us which.
 *    • `sv_save` — keeping an item is a note to yourself. A stranger who reads
 *      it as the store putting one aside has been promised something Trail does
 *      not do, which is the rule the old `Request` button used to carry.
 *    • `co_goes` / `co_how` — what actually travels tonight, and who walks it to
 *      the counter. The prototype states neither, which is the finding.
 *
 *  Home is captured twice on purpose. `p_home_top` is the screen at rest, where
 *  the time buttons are unobstructed and none is pressed, so `hour_first` is a
 *  first click rather than a guess about one. `p_home` is the same screen with
 *  the proximity card across the top, which is the only frame in which the alert
 *  can be judged — and it hides the time buttons, which is why the two are not
 *  interchangeable.
 *    • `c_pay` — no screen in the prototype shows a till. Who a stranger thinks
 *      pays for the gifts is a product rule surviving contact with real eyes.
 *  Nothing respondent-facing hints at a correct answer, and on the scored items
 *  the options are held to the same length and grain as each other: one option
 *  written more carefully than its neighbours is an answer key.
 *
 *  English throughout, and CAD throughout, because the prototype prices in CAD
 *  and a respondent who cannot read the currency is not reading the budget. */

const AGREE = { min: 1, max: 7, low: "Strongly disagree", high: "Strongly agree" } as const;
/** SEQ (Single Ease Question) anchors, verbatim. It is a validated single-item
 *  measure with published benchmarks, and a tidier paraphrase is a different
 *  scale that cannot be read against them. */
const EASY = { min: 1, max: 7, low: "Very difficult", high: "Very easy" } as const;

/** The figures the money section is scored against, read off the prototype's
 *  Gifts screen (`CAD $250` · `CAD $39 spent` · `CAD $211 left`, and the four
 *  recipient rows at 80 / 70 / 45 / 35) and its Bags screen (`Cost CAD $9
 *  (pre-reserved)`). Change them here if the prototype changes and the prompts,
 *  the choice labels and the export header all follow.
 *
 *  Two derivations carry the section:
 *    • `left = budget − spent`, which the screen prints. Getting that wrong is a
 *      reading failure, not an arithmetic one.
 *    • `unallocated = budget − allocated`. Printed nowhere: the four people hold
 *      230 of 250, so 20 is loose, and neither the bar nor any label says so.
 *  And one figure that is not a derivation at all — `left` is exactly 250 − 39,
 *  so the pre-reserved 9 has **not** been taken out of the shopping money.
 *  "Pre-reserved" pulls the other way, and that gap is what `mo_fee` measures. */
export const WALLET = { budget: 250, spent: 39, left: 211, allocated: 230, unallocated: 20, fee: 9 };

const seqNote = (id: string) => [
  { id: `${id}_seq`, kind: "scale" as const, prompt: "Overall, how difficult or easy was this to do?", ...EASY },
  { id: `${id}_note`, kind: "text" as const, long: true, optional: true, prompt: "If anything was confusing or not what you expected, tell us here.", placeholder: "Optional" },
];

const taskTail = (id: string) => [
  { id: `${id}_done`, kind: "single" as const, prompt: "Did you finish this task?", choices: [
    { value: "done", label: "I finished it" },
    { value: "unsure", label: "I think so, but I am not sure" },
    { value: "failed", label: "I could not find it" },
  ] },
  ...seqNote(id),
];

export const uxSurvey: Survey = {
  key: "ux",
  title: "TRAIL usability study",
  lede: "Look through the screens of an app that plans what you buy on a trip and sends it back to your hotel.",
  minutes: "About 20 minutes",
  anonymity: "Anonymous. We do not store your name, email or IP address.",
  intro: [
    "You will see screens from a service that has not launched yet, and tell us what you think you could do with them.",
    "This is not a test with right answers. If a screen is confusing, that is the screen's problem, and that is exactly what we are looking for.",
    "You can close the tab whenever you like. Open it again and you carry on from where you stopped.",
  ],
  closing: "Thank you for going all the way through. What you wrote goes straight into fixing the screens. If you would like to test the beta, we are collecting contacts separately from this survey — reply through wherever you got this link.",
  screenedOutMessage: "This study is for people who have shopped abroad while staying overnight. Thank you for your time.",

  sections: [
    {
      id: "consent",
      title: "Taking part",
      note: "Your answers are anonymous and used only in aggregate. You can stop at any point, and nothing happens if you do.",
      questions: [
        { id: "consent", kind: "consent", prompt: "I have read the above.", label: "I agree to take part" },
      ],
    },

    {
      id: "screener",
      title: "A few checks",
      questions: [
        { id: "s1", kind: "single", prompt: "In the last three years, have you travelled abroad and stayed at least one night?", choices: [
          { value: "yes", label: "Yes" }, { value: "no", label: "No", terminate: true } ] },
        { id: "s2", kind: "single", prompt: "On that trip, did you buy anything in a local store? (excluding duty-free)", choices: [
          { value: "yes", label: "Yes" }, { value: "no", label: "No", terminate: true } ] },
        { id: "s3", kind: "multi", prompt: "Choose everything you have experienced.", choices: [
          { value: "carried", label: "Carrying what I bought made the rest of the day harder" },
          { value: "gaveup", label: "I gave up on buying something because it was heavy or breakable" },
          { value: "backtohotel", label: "I went back to where I was staying just to drop bags off, then went out again" },
          { value: "luggage", label: "I have used a paid bag storage service (Bounce, Stasher and the like)" },
          { value: "none", label: "None of these", exclusive: true } ] },
        // Bands are the original ones converted at roughly 1,000 KRW to the
        // dollar, which is why the codes still read as tens: `5-15` is CAD
        // $50–150. Kept as codes so responses taken before this file was
        // translated stay in the same column.
        { id: "s4", kind: "single", prompt: "On a trip, how much do you usually spend on shopping in one day?", choices: [
          { value: "u5", label: "Under CAD $50" }, { value: "5-15", label: "CAD $50–150" }, { value: "15-30", label: "CAD $150–300" },
          { value: "30-50", label: "CAD $300–500" }, { value: "o50", label: "CAD $500 or more" } ] },
        { id: "s5", kind: "single", prompt: "Have you used an AI chatbot (ChatGPT and the like) to plan a trip?", choices: [
          { value: "often", label: "Often" }, { value: "sometimes", label: "Sometimes" }, { value: "rarely", label: "Once or twice" }, { value: "never", label: "Never" } ] },
      ],
    },

    {
      id: "demo",
      title: "About you",
      note: "Used for aggregate statistics only.",
      questions: [
        // Labels are English; the stored codes are not, and are left alone. They
        // are what already sits in `survey_responses.answers.d1`, and renaming
        // them would split one variable across two vocabularies.
        { id: "d1", kind: "single", prompt: "Age", choices: [
          { value: "10대", label: "Under 20" }, { value: "20대", label: "20–29" }, { value: "30대", label: "30–39" },
          { value: "40대", label: "40–49" }, { value: "50대", label: "50–59" }, { value: "60대 이상", label: "60 or over" } ] },
        { id: "d2", kind: "single", prompt: "Gender", choices: [
          { value: "f", label: "Woman" }, { value: "m", label: "Man" }, { value: "other", label: "Another term" }, { value: "na", label: "Prefer not to say" } ] },
        { id: "d3", kind: "single", prompt: "Who do you usually travel with?", choices: [
          { value: "solo", label: "On my own" }, { value: "couple", label: "Partner" }, { value: "friends", label: "Friends" }, { value: "family", label: "Family" }, { value: "group", label: "A larger group" } ] },
      ],
    },

    {
      id: "before",
      title: "Shopping on a trip, as it is now",
      note: "Before the screens, a few questions about how this usually goes for you.",
      questions: [
        { id: "b1", kind: "matrix", prompt: "How much do you agree that each of these was a hassle on your trips?", ...AGREE, na: "Not applicable", rows: [
          { id: "carry", label: "Carrying what I bought around" },
          { id: "choose", label: "Deciding what to buy when several people are getting gifts" },
          { id: "budget", label: "Keeping track of how much shopping money is left" },
          { id: "route", label: "Working out a route from store locations and opening hours" } ] },
        { id: "b2", kind: "text", long: true, optional: true, prompt: "How do you deal with these today?", placeholder: "Optional" },
      ],
    },

    {
      id: "first",
      title: "First impression",
      note: "The screen below shows for five seconds and then goes away. Answer from memory.",
      stimuli: [{ slot: "p_home", caption: "Opening screen", timedSeconds: 5 }],
      questions: [
        { id: "fi1", kind: "text", long: true, prompt: "What did that screen look like it was for?" },
        { id: "fi2", kind: "text", prompt: "What did you notice first?" },
        { id: "fi3", kind: "scale", prompt: "This looks like a service I would need.", ...AGREE },
      ],
    },

    {
      id: "hour",
      title: "Task 1 — An hour to spare",
      note: "It is your second day in Toronto. You have about an hour free before dinner and you would like to get some of your gift shopping done. Imagine starting from these two screens.",
      stimuli: [{ slot: "p_home_top", caption: "Opening screen" }, { slot: "p_ai", caption: "Asking the app" }],
      questions: [
        ...taskTail("hour"),
        // First click, not a guess about one: `p_home_top` is the frame where the
        // time buttons are unobstructed and none of them is already pressed.
        { id: "hour_first", kind: "single", prompt: "Where on the first screen would you go first?", choices: [
          { value: "chips", label: "The row of time buttons under the greeting" },
          { value: "ask", label: "The box you type a question into" },
          { value: "ready", label: "One of the ready-made questions further down" },
          { value: "stores", label: "One of the store cards" },
          { value: "stats", label: "One of the three summary boxes" },
          { value: "tabs", label: "One of the four tabs along the bottom" } ] },
        { id: "hour_chips", kind: "single", prompt: "You press '1 hour'. What do you expect the app to do?", choices: [
          { value: "shorter", label: "Cut the suggestions down to what I can reach in an hour" },
          { value: "route", label: "Lay out an order to walk them in, with times" },
          { value: "answer", label: "Answer me in the chat" },
          { value: "remember", label: "Remember it and change nothing on this screen" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "hour_effect", kind: "multi", prompt: "Having told it you have one hour, what should that change about what it suggests?", choices: [
          { value: "distance", label: "How far away it sends me" },
          { value: "people", label: "How many of the four people it covers" },
          { value: "count", label: "How many stops it suggests" },
          { value: "price", label: "What it suggests I spend" },
          { value: "nothing", label: "Nothing much", exclusive: true } ] },
        { id: "hour_knows", kind: "single", prompt: "The greeting says the app already knows the city, the day, the four people and how much money is left. How did that read?", choices: [
          { value: "saves", label: "Useful — it saves me repeating myself" },
          { value: "fine", label: "Fine, I would expect that" },
          { value: "check", label: "I would want to check it had that right first" },
          { value: "much", label: "More than I want an app to hold about me" } ] },
      ],
    },

    {
      id: "near",
      title: "The card at the top",
      note: "The opening screen again, with a card that has appeared across the top of it as you walked past a store.",
      stimuli: [{ slot: "p_home", caption: "Opening screen" }],
      questions: [
        { id: "near_needs", kind: "multi", prompt: "For that card to appear, what does the app have to know? Choose everything.", choices: [
          { value: "location", label: "Where I am while I am walking around" },
          { value: "people", label: "Who I am shopping for" },
          { value: "stock", label: "What that store has on its shelves right now" },
          { value: "hours", label: "Whether that store is open" },
          { value: "nothing", label: "Nothing about me — everyone sees the same card", exclusive: true } ] },
        { id: "near_ok", kind: "scale", prompt: "How comfortable are you with an app following which street you are on so it can do this?", min: 1, max: 7, low: "Not comfortable at all", high: "Completely comfortable" },
        { id: "near_permission", kind: "single", prompt: "To send that card, the app has to keep checking your location while you are not looking at it. What would you do?", choices: [
          { value: "always", label: "Allow it all the time" },
          { value: "using", label: "Allow it only while the app is open" },
          { value: "off", label: "Turn it off" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "near_pull", kind: "scale", prompt: "A card like this would get me into the store.", ...AGREE },
        { id: "near_often", kind: "single", prompt: "How often would you want cards like this?", choices: [
          { value: "any", label: "Whenever there is something near me" },
          { value: "few", label: "A few times a day at most" },
          { value: "once", label: "About once a day" },
          { value: "never", label: "Never" } ] },
      ],
    },

    {
      id: "people",
      title: "Task 2 — The people you are buying for",
      note: "Imagine checking who you are buying for on this trip, and then changing who matters most.",
      stimuli: [{ slot: "p_gifts", caption: "Who you are buying for" }],
      questions: [
        ...taskTail("people"),
        { id: "pe_rank", kind: "single", prompt: "What do the small numbers 1 to 4 beside the four people mean?", choices: [
          { value: "order", label: "Which person the app deals with first" },
          { value: "added", label: "The order the people were added in" },
          { value: "money", label: "Who the most money is set aside for" },
          { value: "near", label: "Whose stores are closest to me" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "pe_reorder", kind: "single", prompt: "You decide your coworkers now matter more than your friends. How would you change that here?", choices: [
          { value: "drag", label: "Drag the person up the list" },
          { value: "ai", label: "Ask the app to reorder them" },
          { value: "open", label: "Open the person and change a setting" },
          { value: "money", label: "Change the amounts" },
          { value: "cant", label: "I do not think you can" } ] },
        { id: "pe_means", kind: "multi", prompt: "If someone is first on that list, what should that change? Choose everything.", choices: [
          { value: "route", label: "Which stores I am sent to first" },
          { value: "money", label: "How much money is set aside for them" },
          { value: "time", label: "Who still gets covered if I run out of time" },
          { value: "quality", label: "How much effort goes into their suggestions" },
          { value: "nothing", label: "Nothing — it is only a sort order", exclusive: true } ] },
        // The prototype uses emoji as the recipient's identifier, and carries the
        // same emoji onto the bag tag a stranger reads at the counter. That makes
        // it a function rather than decoration, so it is asked as one.
        { id: "pe_icons", kind: "single", prompt: "Each person has a small picture beside their name. How did you read those?", choices: [
          { value: "tell", label: "They help me tell people apart at a glance" },
          { value: "decor", label: "Decoration — I read the names instead" },
          { value: "unclear", label: "I could not work out what they stood for" },
          { value: "light", label: "They make the app feel less serious than I want" } ] },
        { id: "pe_myself", kind: "single", prompt: "'Myself' is on the list alongside the other three. How does that read?", choices: [
          { value: "right", label: "Right — I buy things for myself on a trip too" },
          { value: "separate", label: "I would keep that separate from the gifts" },
          { value: "never", label: "I do not buy for myself on a trip" },
          { value: "unsure", label: "Not sure" } ] },
      ],
    },

    {
      id: "saved",
      title: "Task 3 — Something for later",
      note: "You have seen a mug you might buy for your mother, but you do not want to carry it around yet. Imagine using this screen.",
      stimuli: [{ slot: "p_wishlist", caption: "Things you kept" }],
      questions: [
        ...taskTail("saved"),
        { id: "sv_save", kind: "single", prompt: "What does keeping an item on this screen do?", choices: [
          { value: "hold", label: "The store puts one aside for me" },
          { value: "order", label: "The app orders it from the store" },
          { value: "note", label: "It is a note to myself to go and buy it" },
          { value: "later", label: "The app buys it later once I say yes" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "sv_tilde", kind: "single", prompt: "The mug is listed at '~CAD $42'. What is that squiggle doing?", choices: [
          { value: "about", label: "It is roughly that — the real price could differ" },
          { value: "exact", label: "Nothing — it is the price" },
          { value: "deal", label: "It marks a price that has come down" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "sv_when", kind: "single", prompt: "When would you actually use a list like this?", choices: [
          { value: "before", label: "Before the trip, planning what to look for" },
          { value: "instore", label: "Standing in a store, unable to decide" },
          { value: "evening", label: "In the evening, working out tomorrow" },
          { value: "never", label: "I do not think I would" } ] },
        { id: "sv_instock", kind: "scale", prompt: "These items will really be in those stores.", ...AGREE },
        { id: "sv_why", kind: "text", long: true, showIf: { q: "sv_instock", has: ["1", "2", "3", "4"] }, prompt: "What made you doubt it?" },
      ],
    },

    {
      id: "money",
      title: "Task 4 — What is left to spend",
      note: "These two screens are from the same trip, on the same afternoon. Take a moment with both.",
      stimuli: [{ slot: "p_gifts", caption: "Who you are buying for" }, { slot: "p_bags", caption: "What you have so far" }],
      questions: [
        { id: "mo_left", kind: "number", prompt: "How much can you still spend on gifts on this trip?", unit: "CAD $", min: 0, max: 100000 },
        { id: "mo_sure", kind: "scale", prompt: "How sure are you about that number?", min: 1, max: 7, low: "Not sure at all", high: "Completely sure" },
        { id: "mo_free", kind: "number", prompt: `Of the CAD $${WALLET.budget}, how much is not set aside for any of the four people?`, unit: "CAD $", min: 0, max: 100000 },
        { id: "mo_fee", kind: "single", prompt: `The second screen puts the delivery at CAD $${WALLET.fee} (pre-reserved). If you go ahead with it, what happens to the CAD $${WALLET.left}?`, choices: [
          { value: "same", label: `It stays at CAD $${WALLET.left} — that money sits apart from it` },
          { value: "drops", label: `It drops to CAD $${WALLET.left - WALLET.fee} once the delivery goes ahead` },
          { value: "already", label: `It is already CAD $${WALLET.fee} lower than it would be` },
          { value: "unsure", label: "Not sure" } ] },
        { id: "mo_prereserved", kind: "text", prompt: "In your own words, what does 'pre-reserved' mean here?" },
        { id: "mo_over", kind: "single", prompt: `What do you think happens if you spend more than CAD $${WALLET.budget}?`, choices: [
          { value: "stops", label: "The app stops me" },
          { value: "warns", label: "It warns me and lets me carry on" },
          { value: "asks", label: "It asks me what to take the extra from" },
          { value: "nothing", label: "Nothing — it is only a number on a screen" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "mo_drop", kind: "multi", prompt: "Is there anything on the first screen you could do without?", choices: [
          { value: "total", label: "The total at the top" },
          { value: "bar", label: "The bar under it" },
          { value: "spent", label: "The amount spent" },
          { value: "each", label: "The amount under each person" },
          { value: "rank", label: "The 1 to 4 ranking" },
          { value: "photos", label: "The rows of photos" },
          { value: "none", label: "Nothing", exclusive: true } ] },
        ...seqNote("mo"),
      ],
    },

    {
      id: "collect",
      title: "Task 5 — Getting it off your hands",
      note: "It is late afternoon and you have been carrying what you bought. Imagine sending it to where you are staying instead.",
      stimuli: [{ slot: "p_bags", caption: "What you have so far" }],
      questions: [
        ...taskTail("collect"),
        { id: "co_goes", kind: "single", prompt: "Four things are listed on this screen. Which of them would go to the hotel this evening?", choices: [
          { value: "bought", label: "Only the box of chocolates you have already bought" },
          { value: "all", label: "All four — the chocolates and the three below" },
          { value: "saved", label: "Only the three you have not bought yet" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "co_partner", kind: "single", prompt: "What did you take 'Blue Banana Market' to be?", choices: [
          { value: "dropoff", label: "Where you leave the bags" },
          { value: "shop", label: "A store selling one of the gifts" },
          { value: "carrier", label: "The company that does the driving" },
          { value: "hotel", label: "Another name for the hotel" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "co_how", kind: "single", prompt: "How do the bags get from you to Blue Banana Market?", choices: [
          { value: "walk", label: "I walk them over there myself" },
          { value: "pickup", label: "Someone comes to collect them from me" },
          { value: "stores", label: "The stores I bought from send them there" },
          { value: "direct", label: "They do not — they go straight to the hotel" },
          { value: "unsure", label: "Not sure" } ] },
        // The pencilled note on the wireframes: a traveller buys things the app
        // never planned. Nothing on this screen says whether those can travel.
        { id: "co_extra", kind: "single", prompt: "On the same afternoon you also buy a coat at a store the app never mentioned. Could that go in the same delivery?", choices: [
          { value: "yes", label: "Yes, I would add it at the counter" },
          { value: "app", label: "Only if I put it into the app first" },
          { value: "no", label: "No — only what the app already knows about" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "co_charge", kind: "single", prompt: `When is the CAD $${WALLET.fee} taken from you?`, choices: [
          { value: "now", label: "When I press the button on this screen" },
          { value: "drop", label: "When I leave the bags at the counter" },
          { value: "after", label: "After they reach the hotel" },
          { value: "earlier", label: "It was taken earlier, when the trip was set up" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "co_worry", kind: "multi", prompt: "Choose everything that felt worrying at this step.", choices: [
          { value: "lost", label: "The bags could go missing" },
          { value: "staff", label: "Store staff might not know this service" },
          { value: "hotel", label: "The hotel might not take them" },
          { value: "pay", label: "The payment could go wrong" },
          { value: "late", label: "They might not arrive in time" },
          { value: "mix", label: "The wrong bag could reach the wrong person" },
          { value: "none", label: "Nothing in particular", exclusive: true } ] },
      ],
    },

    {
      id: "counter",
      title: "Task 6 — At the counter",
      note: "You have walked your bags over to the store. Imagine standing at the counter with this on your phone.",
      stimuli: [{ slot: "p_dropoff", caption: "At the store" }],
      questions: [
        ...taskTail("counter"),
        { id: "ct_clear", kind: "scale", prompt: "From this screen alone, do you know what to do in the store?", min: 1, max: 7, low: "Not clear at all", high: "Completely clear" },
        { id: "ct_count", kind: "single", prompt: "Who checks that the number of bags is right?", choices: [
          { value: "staff", label: "Store staff, against the code" },
          { value: "me", label: "I do, on my own screen" },
          { value: "both", label: "Both of us" },
          { value: "nobody", label: "Nobody — the app already knows" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "ct_tag", kind: "single", prompt: "Store staff attach a tag to each bag with the person's name and picture on it. How does that sit with you?", choices: [
          { value: "fine", label: "Fine as it is" },
          { value: "initials", label: "I would want initials rather than names" },
          { value: "nonames", label: "I would want no names on the tag at all" },
          { value: "unsure", label: "Not sure" } ] },
        // The prototype says "by 7:00 PM" here and "Estimated 6:30–7:00 PM" one
        // screen earlier. Which of the two a stranger carries away is the point.
        { id: "ct_time", kind: "single", prompt: "The last step says the bags reach the hotel by 7:00 PM. The screen before this one said 6:30–7:00 PM. How did you read that?", choices: [
          { value: "promise", label: "As a promise — they will be there by seven" },
          { value: "estimate", label: "As a rough estimate that could slip" },
          { value: "clash", label: "I noticed the two screens did not say the same thing" },
          { value: "missed", label: "I did not take in the time at all" } ] },
        { id: "ct_odd", kind: "text", long: true, optional: true, prompt: "Was anything here different from what the screen before it led you to expect?", placeholder: "Optional" },
      ],
    },

    {
      id: "onway",
      title: "Task 7 — After you walk away",
      note: "You have handed the bags over and left the store.",
      stimuli: [{ slot: "p_tracking", caption: "After the hand-over" }],
      questions: [
        { id: "ow_where", kind: "single", prompt: "Where are the bags right now?", choices: [
          { value: "store", label: "Still at the store" },
          { value: "transit", label: "Picked up and on the way" },
          { value: "hotel", label: "At the hotel" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "ow_calm", kind: "scale", prompt: "How reassuring is this screen?", min: 1, max: 7, low: "Not reassuring at all", high: "Very reassuring" },
        { id: "ow_more", kind: "multi", prompt: "What else do you think should be here?", choices: [
          { value: "driver", label: "A name and number for whoever has them" },
          { value: "live", label: "A live location on a map" },
          { value: "photo", label: "A photo of the bags as proof" },
          { value: "desk", label: "Who at the hotel took them in" },
          { value: "contents", label: "A list of what is in each bag" },
          { value: "none", label: "Nothing", exclusive: true } ] },
        { id: "ow_late", kind: "single", prompt: "It is 7:20 PM and this screen still reads 'On the way'. What would you do first?", choices: [
          { value: "wait", label: "Wait a while longer" },
          { value: "app", label: "Look for a way to report it in the app" },
          { value: "hotel", label: "Ring the hotel" },
          { value: "trail", label: "Look for a phone number for Trail" },
          { value: "unsure", label: "Not sure" } ] },
        ...seqNote("ow"),
      ],
    },

    {
      id: "concepts",
      title: "What you took from the screens",
      note: "These are not questions with right answers. If that is how the screens read to you, choose that.",
      questions: [
        { id: "c_pay", kind: "single", prompt: "Who pays for the gifts themselves?", choices: [
          { value: "app", label: "The app pays and bills me" },
          { value: "me", label: "I pay in the store" },
          { value: "hotel", label: "The hotel pays and adds it to my bill" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "c_over", kind: "single", prompt: "In the store the real price turns out to be CAD $40 more than the app planned for. What should the app do?", choices: [
          { value: "auto", label: "Move money around by itself and carry on" },
          { value: "propose", label: "Suggest a change and wait for me" },
          { value: "remove", label: "Take something off the list to pay for it" },
          { value: "nothing", label: "Say nothing and let me deal with it" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "c_where", kind: "single", prompt: "Three of the four tabs hold things you might buy. Where would you look for something you kept but have not bought?", choices: [
          { value: "gifts", label: "Gifts" }, { value: "wishlist", label: "Wishlist" }, { value: "bags", label: "Bags" },
          { value: "any", label: "Any of them — they look like the same list" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "c_demo", kind: "single", prompt: "Did you see anything marked as a demo, a sample or simulated?", choices: [
          { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "I do not remember" } ] },
        { id: "c_demo_where", kind: "text", showIf: { q: "c_demo", has: ["yes"] }, prompt: "Which screen was it on, and what did it say?" },
        { id: "c_auto", kind: "multi", prompt: "Choose everything this app should be free to do on its own, without asking you.", choices: [
          { value: "suggest", label: "Suggest items" },
          { value: "reorder", label: "Change who is top of the list" },
          { value: "notify", label: "Send a card when I walk near a store" },
          { value: "move", label: "Move money between people" },
          { value: "remove", label: "Take an item off a list" },
          { value: "arrange", label: "Arrange the delivery" },
          { value: "pay", label: "Pay the delivery fee" },
          { value: "none", label: "None of them", exclusive: true } ] },
      ],
    },

    {
      id: "scales",
      title: "Overall",
      questions: [
        // UMUX-Lite, both items in their published wording: the SUS conversion in
        // the analysis plan is calibrated on these two sentences, not on a tidier
        // pair that would measure something next to them.
        { id: "umux", kind: "matrix", prompt: "How much do you agree?", ...AGREE, rows: [
          { id: "needs", label: "This app's capabilities meet my requirements" },
          { id: "easy", label: "This app is easy to use" } ] },
        { id: "trust", kind: "matrix", prompt: "How much do you agree?", ...AGREE, rows: [
          { id: "stock", label: "Items this app recommends will really be in the store" },
          { id: "lost", label: "Bags I hand to this app will not go missing" },
          { id: "money", label: "This app will not spend my money without my permission" },
          { id: "eta", label: "The arrival times this app shows can be relied on" },
          { id: "honest", label: "This app does not say it can do things it cannot" } ] },
        { id: "aichat", kind: "matrix", prompt: "About the app answering questions for you.", ...AGREE, rows: [
          { id: "context", label: "It already knowing my trip and my budget is worth it to me" },
          { id: "ready", label: "The ready-made questions were ones I would actually ask" },
          { id: "madeup", label: "Some of what it showed looked made up" } ] },
      ],
    },

    {
      id: "failures",
      title: "If this happened",
      note: "Each of these can really happen. Tell us what you would want the app to do.",
      questions: [
        { id: "f1", kind: "text", long: true, prompt: "\"We could not find an item that matches.\" — what would you want the app to do?" },
        { id: "f2", kind: "text", long: true, prompt: "\"In the store, the real price was CAD $40 higher than planned.\" — what would you want it to do?" },
        { id: "f3", kind: "single", prompt: "\"These bags cannot be delivered today.\" — when should you find that out?", choices: [
          { value: "before", label: "Before you hand the bags over" }, { value: "after", label: "Just after you hand them over" },
          { value: "eta", label: "Any time before the arrival window" }, { value: "any", label: "It does not matter" } ] },
        { id: "f4", kind: "text", long: true, prompt: "\"The hotel front desk would not take the bags.\" — what do you expect next?" },
        { id: "f5", kind: "single", prompt: "Of those four, which one would stop you using this service again?", choices: [
          { value: "nomatch", label: "No item found" }, { value: "overbudget", label: "Over budget" },
          { value: "nodelivery", label: "Bags cannot be delivered" }, { value: "refused", label: "The hotel would not take them" },
          { value: "none", label: "I would keep using it anyway" } ] },
      ],
    },

    {
      id: "price",
      title: "Price",
      // The arrival window is back in the description, and stated the way the
      // prototype states it. That is a product decision rather than a survey
      // one: the screens now quote 6:30–7:00 PM before the hand-over, so a
      // survey that priced an unquoted window would price a different service.
      //
      // Every price id is new for the same reason. A van Westendorp curve built
      // from two descriptions is one curve drawn through two populations.
      note: "Everything you bought that day — one to three shopping bags — left at a partner store counter on your way past, and taken to your hotel front desk the same evening, between 6:30 and 7:00 PM. You carry none of it for the rest of the day. Answer in whole Canadian dollars.",
      questions: [
        { id: "pr_expensive", kind: "number", prompt: "At what price is this so expensive that you would not use it?", unit: "CAD $", min: 0, max: 1000 },
        { id: "pr_pricey", kind: "number", prompt: "At what price does it start to feel expensive — not out of the question, but you would think about it?", unit: "CAD $", min: 0, max: 1000 },
        { id: "pr_cheap", kind: "number", prompt: "At what price is it a bargain — a good buy for the money?", unit: "CAD $", min: 0, max: 1000 },
        { id: "pr_toocheap", kind: "number", prompt: "At what price is it so cheap that you would doubt the quality?", unit: "CAD $", min: 0, max: 1000 },
        { id: "pr_intent", kind: "scale", prompt: `If this cost CAD $${WALLET.fee}, would you use it?`, min: 1, max: 7, low: "Definitely not", high: "Definitely would" },
        { id: "pr_window", kind: "single", prompt: "Which would you rather be told as you hand the bags over?", choices: [
          { value: "window", label: "An estimated window, like 6:30 to 7:00 PM" },
          { value: "deadline", label: "A time it will not be later than, like by 7:00 PM" },
          { value: "paymore", label: "A time it will not be later than, and I would pay more for that" },
          { value: "unsure", label: "Not sure" } ] },
        { id: "pr_who", kind: "single", prompt: "Who do you think should be paying for this?", choices: [
          { value: "me", label: "Me, all of it" }, { value: "split", label: "Part me, part the store" },
          { value: "store", label: "The store, all of it" }, { value: "hotel", label: "The hotel, all of it" }, { value: "unsure", label: "Not sure" } ] },
      ],
    },

    {
      id: "close",
      title: "Last few",
      questions: [
        { id: "nps", kind: "scale", prompt: "How likely are you to recommend this service to a friend who is travelling?", min: 0, max: 10, low: "Not at all likely", high: "Extremely likely" },
        { id: "liked", kind: "text", long: true, prompt: "Tell us the one thing you liked most about this app." },
        { id: "fix", kind: "text", long: true, prompt: "If you could fix one thing, what would you fix?" },
        { id: "missing", kind: "text", long: true, optional: true, prompt: "Was there anything you expected to find and did not?", placeholder: "Optional" },
        // No contact field: the anonymity promise at the top of this survey is
        // only true if nothing here can identify a respondent. Intent is the
        // measure; recruiting happens through the address in `closing`.
        { id: "beta", kind: "single", prompt: "If this launches, would you take part as a beta tester?", choices: [
          { value: "yes", label: "Yes" }, { value: "maybe", label: "Depends" }, { value: "no", label: "No" } ] },
      ],
    },
  ],
};
