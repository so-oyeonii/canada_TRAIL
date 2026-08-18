# TRAIL — English User Flow

## Product promise

TRAIL is an AI-powered offline shopping planner and hotel delivery service for travelers. It helps a traveler decide what to buy, where to buy it, stay within a shared trip-shopping budget, and send purchased bags from a participating store to the hotel.

## Core user flow

1. **Set the trip context**
   - Confirm city, hotel, stay dates, current location, and available shopping time.
   - Set one total shopping budget, including gifts, personal purchases, and a delivery reserve.

2. **List everyone to shop for**
   - Add gift recipients, group size, relationship, preferences, and priority.
   - Add “Myself” as a first-class shopping target.
   - Choose whether personal purchases share the total budget or use a separate budget.

3. **Talk to Trail AI**
   - Describe what each gift should feel like in natural language.
   - Trail asks only the missing questions: quantity, equal-value gifts, sharing needs, local preference, packing limits, and delivery needs.
   - The conversation continuously updates a structured plan draft.

4. **Review and customize the plan draft**
   - Review recipients, quantities, categories, priorities, and person-level budgets.
   - Mark each person `Must buy`, `Planned`, or `If there's money left` on Gifts ▸ Split.
     This is the only place the mark is edited, it stays editable after approval, and it
     moves no money: it sets what Trail suggests cutting first, nothing else.
   - Edit any field directly or keep talking to Trail. Trail records a mark the traveler
     said out loud and never infers one from a relationship; a mark it heard waits for a tap.
   - See the effect on store count, route time, and remaining budget before approval.

5. **Approve the shopping plan**
   - Trail recommends specific products paired with physical stores.
   - Every recommendation includes price, stock confidence, opening status, walking time, packing burden, delivery eligibility, and the reason for the match.
   - The route minimizes unnecessary stops and ends at a bag-drop partner when possible.

6. **Shop offline**
   - Remaining stops are ordered must-buys first; purchased stops keep the order they were
     recorded in. If what is left to spend is under the unbought must-buy total, the shop
     screen and the over-budget sheet say so by name before anything is recorded.
   - At each store, mark an item as purchased, unavailable, or replaced.
   - Record the actual price and number of bags.
   - The app updates purchased progress, actual spend, and remaining budget immediately.

7. **Rebalance the budget**
   - If an actual price differs from the plan, Trail proposes a new allocation.
   - If a split is over the shopping bucket, Trail can suggest one that keeps the must-buys:
     it fills the amount fields and saves nothing, and whole amounts are dropped rather than
     scaled, so no figure appears that the traveler never typed. If the must-buys alone are
     over the bucket, Trail says so and offers no split at all.
   - The traveler can approve the rebalance or edit it manually.
   - Trail never changes a budget or removes an item without approval, and never buys anything.

8. **Send bags to the hotel**
   - Trail recommends delivery when bags are heavy, fragile, numerous, or inconvenient for the remaining itinerary.
   - The traveler confirms the hotel, bag count, handling notes, and delivery fee.
   - A participating store seals the bags and hands them to an assigned driver.

9. **Track delivery**
   - Track driver assignment, store pickup, hotel route, and front-desk handoff.
   - Delivery closes with the recipient name, timestamp, and proof of handoff.

## Permanent app navigation

- **Home** — Morning view. Trip wallet, what the trip is waiting on, and local
  recommendations. Every card that is not live inventory is labelled Sample.
- **Trips** — Every trip on the account, and the workbench for the active one:
  the plan (Gifts, Map, Budget, Delivery), the in-store shopping mode, and the
  purchase record.
- **AI** — Trail AI. Conversation, the brief it builds, and plan changes. Trail
  recommends and calculates; it never approves.
- **Bags** — Everything after a purchase: choosing bags (including bags bought
  outside the plan), drop-off, payment, tracking, receipts, and reporting a
  problem.

Shop is not a tab. It is a mode inside Trips, entered from the plan and left
when the traveler goes hands-free.

Tab keys are not URL segments. `/trail/*` keeps its paths and belongs to Trips,
so every link ever shared still opens.

## Product rule

Trail may recommend and calculate, but the traveler always approves budget changes, purchases, substitutions, and delivery.
