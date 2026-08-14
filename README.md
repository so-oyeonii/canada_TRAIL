# TRAIL

An AI shopping planner and hotel bag delivery service for travellers.

TRAIL helps a traveller decide what to buy and where, keeps every purchase inside
one shared trip budget, and sends the bags they have already bought from a
partner store to their hotel — so the rest of the day is hands-free.

**Trail recommends and calculates. The traveller approves every budget change,
purchase, substitution and delivery.**

## Stack

- Next.js 16 (App Router) + React 19, deployed on Vercel
- Supabase — Postgres with row level security, email magic-link auth
- OpenAI for the Trail AI conversation (`gpt-5.6-luna` by default)

## Getting started

Requires Node 22.13 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the two blank keys
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build, the same one Vercel runs |
| `npm test` | Regression tests for the brief guards |
| `npm run lint` | ESLint |

## Environment

`.env.example` lists every variable. Two need filling:

- `OPENAI_API_KEY` — from platform.openai.com. Set a monthly spend cap on the project.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase → Project Settings → API → Publishable key.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row level security entirely. It is optional,
server-only, and must never be imported from client code.

For magic-link sign-in to return correctly, add your dev and deployed URLs to
Supabase → Authentication → URL Configuration → Redirect URLs.

## Layout

| Path | Contents |
| --- | --- |
| `app/page.tsx` | The trip screens: home, chat, brief, route, shop, bags, tracking, profile |
| `app/login`, `app/auth/callback` | Magic-link sign-in |
| `app/api/chat` | Trail AI turn: structured brief patch, rate limited, same-origin only |
| `app/trail-brief.ts` | Prompt, output schema, and the guards that keep bad values out of the brief |
| `lib/supabase` | Browser and server clients |
| `supabase/migrations` | Schema and RLS policies |
| `docs/MIGRATION_PLAN.md` | Where the product is going and in what order |
| `docs/figma` | Reference frames for the screens still to be built |

## Data rules

- Money is stored as integer cents.
- The custody ledger and the plan-change ledger are append-only. The traveller can
  report a drop-off, a delay or a seal problem; collection, transit and hotel
  handoff are written by the server.
- Anything not confirmed against live data is labelled `Sample` or `Simulated`.
