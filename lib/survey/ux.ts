import type { Survey } from "./types";

/** The wireframe usability instrument. Mirrors docs/surveys/UX_SURVEY.md; that
 *  file keeps the analysis notes and failure thresholds, this one keeps only
 *  what a respondent sees.
 *
 *  Two questions here are scored right/wrong rather than rated, and they are the
 *  reason the study exists:
 *    • `t4_remaining` — the wallet either communicates that flexible money is
 *      locked, or it does not. A Likert item cannot tell us which.
 *    • `e1`/`e2`/`e3` — the approval gate and "Request is an enquiry" are
 *      product rules. If they do not survive contact with a stranger's eyes,
 *      they are not rules, they are comments in a spec.
 *  Nothing in the respondent-facing text hints at a correct answer. On those
 *  three the options are held to the same length and the same grain as each
 *  other: one option written more carefully than its neighbours is an answer key.
 *
 *  English throughout, and the money is CAD throughout, because the app the
 *  screens come from prices in CAD and a respondent who cannot read the wallet's
 *  currency is not reading the wallet. */

const AGREE = { min: 1, max: 7, low: "Strongly disagree", high: "Strongly agree" } as const;
/** SEQ (Single Ease Question) anchors, verbatim. It is a validated single-item
 *  measure with published benchmarks, and a tidier paraphrase is a different
 *  scale that cannot be read against them. */
const EASY = { min: 1, max: 7, low: "Very difficult", high: "Very easy" } as const;

/** The wallet numbers the T4 task is scored against. If the frame in
 *  /public/survey/f8.png shows different figures, change them here and the
 *  prompt, the placeholder and the export header all follow.
 *
 *  These are the split the app actually produces for a CAD $250 Toronto trip, not
 *  the wireframe's. The reserve was 9 here and in `docs/APP_SPEC.md`; migration 0005
 *  says that figure was "mockup; the cost work puts the floor near $15" and seeds 15,
 *  which is what `quoteFee()` charges. Asking a respondent what "Reserved for delivery
 *  CAD $9" means, over a screen that reads $15, measures nothing.
 *
 *  `answer` is `planned − spent`: the delivery reserve and the flexible bucket are both
 *  outside what a traveller may shop with, which is the whole point of the task. */
export const WALLET = { planned: 200, spent: 176, flexible: 35, reserved: 15, answer: 24 };

const taskTail = (id: string) => [
  { id: `${id}_done`, kind: "single" as const, prompt: "Did you finish this task?", choices: [
    { value: "done", label: "I finished it" },
    { value: "unsure", label: "I think so, but I am not sure" },
    { value: "failed", label: "I could not find it" },
  ] },
  { id: `${id}_seq`, kind: "scale" as const, prompt: "Overall, how difficult or easy was this task to complete?", ...EASY },
  { id: `${id}_note`, kind: "text" as const, long: true, optional: true, prompt: "If anything was confusing or not what you expected, tell us here.", placeholder: "Optional" },
];

export const uxSurvey: Survey = {
  key: "ux",
  title: "TRAIL usability study",
  lede: "Look through the screens of an app that sends what you buy on a trip back to your hotel.",
  minutes: "About 18 minutes",
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
      stimuli: [{ slot: "f1", caption: "Home screen", timedSeconds: 5 }],
      questions: [
        { id: "c1", kind: "text", long: true, prompt: "What did that screen look like it was for?" },
        { id: "c2", kind: "text", prompt: "What did you notice first?" },
        { id: "c3", kind: "scale", prompt: "This looks like a service I would need.", ...AGREE },
      ],
    },

    {
      id: "t1",
      title: "Task 1 — Adding a trip and a budget",
      note: "You are going to Toronto for three days next week. Imagine adding that trip to this app and setting a cap on what you will spend on shopping, then look at the screens below.",
      stimuli: [{ slot: "f2", caption: "Getting started" }, { slot: "f3", caption: "Answering the questions" }],
      questions: [
        ...taskTail("t1"),
        { id: "t1_mode", kind: "single", prompt: "The app asks one question at a time in a chat. Next to typing into a form, how was that?", choices: [
          { value: "chat2", label: "Chat is much better" }, { value: "chat1", label: "Chat is a little better" }, { value: "same", label: "About the same" },
          { value: "form1", label: "A form is a little better" }, { value: "form2", label: "A form is much better" } ] },
        { id: "t1_count", kind: "single", prompt: "How did the number of questions feel?", choices: [
          { value: "few", label: "Too few" }, { value: "ok", label: "About right" }, { value: "many", label: "Too many" } ] },
        { id: "t1_uncomfortable", kind: "multi", prompt: "Were any of the questions uncomfortable, or ones you would rather not answer?", choices: [
          { value: "city", label: "Which city you are going to" }, { value: "dates", label: "When you are going" }, { value: "who", label: "Who you are buying for" },
          { value: "budget", label: "Your total budget" }, { value: "hotel", label: "Where you are staying" }, { value: "taste", label: "Your taste" },
          { value: "none", label: "None of them", exclusive: true } ] },
      ],
    },

    {
      id: "t2",
      title: "Task 2 — Checking and changing the plan",
      note: "Imagine checking the plan the app put together, and swapping one person's gift for something else.",
      stimuli: [{ slot: "f5", caption: "Chat and plan summary" }, { slot: "f6", caption: "Gift list" }],
      questions: [
        ...taskTail("t2"),
        { id: "t2_accurate", kind: "scale", prompt: "The plan summary card matched what I said.", ...AGREE },
        { id: "t2_instock", kind: "scale", prompt: "The items it recommended are probably really in those stores.", ...AGREE },
        { id: "t2_why", kind: "text", long: true, showIf: { q: "t2_instock", has: ["1", "2", "3", "4"] }, prompt: "What made you doubt it?" },
        { id: "t2_edit", kind: "single", prompt: "When you want to change the plan, which would you use?", choices: [
          { value: "edit", label: "Edit it myself" }, { value: "ai", label: "Tell the AI" }, { value: "depends", label: "Depends on the situation" } ] },
      ],
    },

    {
      id: "t3",
      title: "Task 3 — Checking the route",
      note: "Imagine checking how many places you have to visit today, and in what order.",
      stimuli: [{ slot: "f7", caption: "Today's route" }],
      questions: [
        ...taskTail("t3"),
        { id: "t3_source", kind: "single", prompt: "Where did you get that from?", choices: [
          { value: "map", label: "The map" }, { value: "list", label: "The list below it" }, { value: "both", label: "Both" }, { value: "neither", label: "Neither one read clearly" } ] },
        { id: "t3_follow", kind: "scale", prompt: "I would actually walk this route.", ...AGREE },
        { id: "t3_missing", kind: "text", long: true, optional: true, prompt: "Was there anything about the route you wanted to know that was not on the screen?", placeholder: "Optional" },
      ],
    },

    {
      id: "t4",
      title: "Task 4 — Checking the budget",
      note: "Look at this screen and tell us how much is left to spend on shopping on this trip.",
      stimuli: [{ slot: "f8", caption: "Trip wallet" }],
      questions: [
        { id: "t4_remaining", kind: "number", prompt: "How much can you still spend on shopping?", unit: "CAD $", min: 0, max: 100000 },
        { id: "t4_confidence", kind: "scale", prompt: "How sure are you about that number?", min: 1, max: 7, low: "Not sure at all", high: "Completely sure" },
        { id: "t4_flexible", kind: "text", prompt: `What did you take 'Flexible CAD $${WALLET.flexible}' on the screen to mean?` },
        { id: "t4_reserved", kind: "text", prompt: `What did you take 'Reserved for delivery CAD $${WALLET.reserved}' on the screen to mean?` },
        { id: "t4_drop", kind: "multi", prompt: "Is there anything on this screen you could do without?", choices: [
          { value: "total", label: "Total budget" }, { value: "planned", label: "Planned shopping" }, { value: "spent", label: "Spent" },
          { value: "reserved", label: "Reserved for delivery" }, { value: "flexible", label: "Flexible" },
          { value: "none", label: "Nothing", exclusive: true } ] },
        ...taskTail("t4"),
      ],
    },

    {
      id: "t5",
      title: "Task 5 — Sending the bags",
      note: "You now have three shopping bags. Imagine sending them to where you are staying instead of carrying them.",
      stimuli: [{ slot: "f9", caption: "Delivery screen" }, { slot: "f10", caption: "Payment screen" }, { slot: "f11", caption: "Handing the bags over" }],
      questions: [
        ...taskTail("t5"),
        { id: "t5_partner", kind: "single", prompt: "What did you take 'Blue Banana Market' on the screen to be?", choices: [
          { value: "dropoff", label: "Where you leave the bags" }, { value: "shop", label: "A store that sells the gifts" }, { value: "carrier", label: "The delivery company" }, { value: "unsure", label: "Not sure" } ] },
        { id: "t5_when", kind: "single", prompt: "When did you understand the CAD $9 delivery fee is charged?", choices: [
          { value: "now", label: "Now" }, { value: "dropoff", label: "When you leave the bags" }, { value: "arrival", label: "After they reach the hotel" }, { value: "unsure", label: "Not sure" } ] },
        { id: "t5_qr", kind: "scale", prompt: "From the QR screen alone, do you know what to do in the store?", min: 1, max: 7, low: "Not clear at all", high: "Completely clear" },
        { id: "t5_worry", kind: "multi", prompt: "Choose everything that felt worrying at this step.", choices: [
          { value: "lost", label: "The bags could go missing" }, { value: "staff", label: "Store staff might not know this service" },
          { value: "hotel", label: "The hotel might not take them" }, { value: "pay", label: "The payment could go wrong" },
          { value: "late", label: "They might not arrive in time" },
          { value: "none", label: "Nothing in particular", exclusive: true } ] },
      ],
    },

    {
      id: "t6",
      title: "Task 6 — Checking the delivery",
      note: "Imagine checking where the bags you handed over are now.",
      stimuli: [{ slot: "f12", caption: "Delivery tracking" }],
      questions: [
        { id: "t6_where", kind: "single", prompt: "Where are the bags right now?", choices: [
          { value: "store", label: "Still at the store" }, { value: "transit", label: "Picked up and on the way" }, { value: "hotel", label: "At the hotel" }, { value: "unsure", label: "Not sure" } ] },
        { id: "t6_calm", kind: "scale", prompt: "How reassuring is this screen?", min: 1, max: 7, low: "Not reassuring at all", high: "Very reassuring" },
        { id: "t6_more", kind: "multi", prompt: "What else do you think should be here?", choices: [
          { value: "driver", label: "The driver's name and number" }, { value: "live", label: "A live location map" }, { value: "photo", label: "A photo as proof" },
          { value: "desk", label: "Who signed for them at the hotel" }, { value: "none", label: "Nothing", exclusive: true } ] },
        ...taskTail("t6"),
      ],
    },

    {
      id: "concepts",
      title: "What you took from the screens",
      note: "These are not questions with right answers. If that is how the screen read to you, choose that.",
      questions: [
        { id: "e1", kind: "single", prompt: "What did you take the 'Request' button next to an item to do?", choices: [
          { value: "order", label: "Orders it from the store" }, { value: "reserve", label: "Reserves it at the store" },
          { value: "enquiry", label: "Asks the store about stock" }, { value: "unsure", label: "Not sure" } ] },
        { id: "e2", kind: "single", prompt: "Who pays for the items themselves?", choices: [
          { value: "app", label: "The app pays for me" }, { value: "me", label: "I pay at the store" },
          { value: "hotel", label: "The hotel pays for me" }, { value: "unsure", label: "Not sure" } ] },
        { id: "e3", kind: "single", prompt: "The real price is higher than planned and the budget is over. What did you take the app to do?", choices: [
          { value: "auto", label: "Rebalances the budget on its own" },
          { value: "propose", label: "Suggests a change and waits for you" },
          { value: "delete", label: "Removes the item from the plan" }, { value: "unsure", label: "Not sure" } ] },
        { id: "e4", kind: "single", prompt: "Did you see 'Sample' or 'Simulated' marked anywhere on the screens?", choices: [
          { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "I do not remember" } ] },
        { id: "e4_where", kind: "text", showIf: { q: "e4", has: ["yes"] }, prompt: "Which screen was it on?" },
        { id: "e5", kind: "multi", prompt: "Choose everything this app should be free to do on its own, without asking you.", choices: [
          { value: "recommend", label: "Recommend items" }, { value: "route", label: "Work the route out again" }, { value: "rebalance", label: "Move money between budgets" },
          { value: "remove", label: "Delete an item" }, { value: "swap", label: "Swap in a replacement item" }, { value: "delivery", label: "Arrange the delivery" },
          { value: "pay", label: "Pay" }, { value: "none", label: "None of them", exclusive: true } ] },
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
        { id: "ai", kind: "matrix", prompt: "About the chat with the AI.", ...AGREE, rows: [
          { id: "understood", label: "I felt the AI understood my taste in gifts" },
          { id: "necessary", label: "The questions the AI asked were ones it needed to ask" },
          { id: "madeup", label: "Some of what the AI said looked made up" } ] },
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
      // Not "same-day", not "that evening". Trail quotes the arrival window at
      // the counter (`etaLabel`, and the pay screen with the same-day line
      // removed), so a survey that priced an evening delivery would be pricing a
      // promise no screen makes and reading the answer back as revenue. What is
      // described here is what the product does do: the bags stop being yours to
      // carry, and the time is quoted, not promised.
      note: "Three shopping bags (about 2.4 kg) left at a partner store counter and delivered to your hotel, so you do not carry them for the rest of the day. The arrival window is quoted at the counter when you hand them over. Answer in whole Canadian dollars.",
      questions: [
        { id: "p_expensive", kind: "number", prompt: "At what price is this so expensive that you would not use it?", unit: "CAD $", min: 0, max: 1000 },
        { id: "p_pricey", kind: "number", prompt: "At what price does it start to feel expensive — not out of the question, but you would think about it?", unit: "CAD $", min: 0, max: 1000 },
        { id: "p_cheap", kind: "number", prompt: "At what price is it a bargain — a good buy for the money?", unit: "CAD $", min: 0, max: 1000 },
        { id: "p_toocheap", kind: "number", prompt: "At what price is it so cheap that you would doubt the quality?", unit: "CAD $", min: 0, max: 1000 },
        { id: "p_intent", kind: "scale", prompt: "If this cost CAD $9, would you use it?", min: 1, max: 7, low: "Definitely not", high: "Definitely would" },
        { id: "p_who", kind: "single", prompt: "Who do you think should be paying for this?", choices: [
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
