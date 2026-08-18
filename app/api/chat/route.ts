import { briefContext, composeTurn, emptyReply, inferPlanPatch, sanitizeBriefPatch, sanitizeWindow, tripCurrency, FALLBACK_REPLY, SYSTEM_PROMPT, TURN_SCHEMA, type ChatErrorCode, type ChatReply, type ChatTurn, type KnownRecipient, type ModelTurn, type Plan, type PlanPatch, type TripContext, type TurnContext } from "../../trail-brief";

import { getTraveler } from "../../../lib/supabase/server";
import { createAdminClient, hasAdminClient } from "../../../lib/supabase/admin";
import { isDeployed } from "../../../lib/env/deployment";
import { sameOrigin } from "../../../lib/api/http";
import { burstStore, chatQuota, type RecordHit } from "../../../lib/api/rate-limit";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "gpt-5.6-luna";
/** Four turns, not twelve: the candidate block (W6b) has to fit in the same context window. */
const MAX_HISTORY = 4;
const MAX_TURN_CHARS = 500;
const MAX_BODY_BYTES = 32 * 1024;

/** The client still owns the brief until T3 wires `GET /api/state` into this route. Everything it
 *  sends is treated as untrusted input and re-derived through the sanitizers before it is used. */
type ChatPayload = { message?: string; plan?: Plan; trip?: TripContext; history?: ChatTurn[]; recipients?: KnownRecipient[]; plannedUnits?: number; unallocatedUnits?: number; planApproved?: boolean; hasPurchases?: boolean; preferenceTags?: unknown; routeTag?: unknown; missingFields?: unknown; window?: unknown };

/** What still has to be answered before a plan can be built. The client is the only side that knows
 *  about the hotel — the name never leaves the browser, so "hotel" as a *word* is the most the
 *  server can be told about it — and the server re-derives the rest so a client that claims nothing
 *  is missing cannot switch the questions off. Union, not trust: more missing is the safe direction. */
const REQUIRED_FIELDS = ["city", "hotel", "budget", "recipients", "preferences"] as const;

/** The burst tier only. The number that binds is the row `record_chat_hit` writes, which
 *  every instance shares — see `lib/api/rate-limit.ts` and migration 0030. */
const burst = burstStore();

/** `null` rather than a thrown error on a bad answer, so the limiter can tell "the database
 *  said no" apart from "the database said nothing" and fail closed on both. */
const recordHit: RecordHit = async (key, windowSeconds, limit) => {
  const rpc = await createAdminClient().rpc("record_chat_hit", { p_user: key, p_window_seconds: windowSeconds, p_limit: limit });
  if (rpc.error) { console.error("Trail AI quota unavailable", rpc.error.code); return null; }
  return typeof rpc.data === "boolean" ? rpc.data : null;
};

function fail(code: ChatErrorCode, message: string, suggested: PlanPatch = {}) {
  return Response.json(emptyReply(message, "fallback", code, suggested) satisfies ChatReply);
}

/** One recipient list, however the client described it. A legacy payload carries a single name in
 *  `plan.recipient`; the refs are minted here so the model only ever sees r1, r2 … and never a uuid. */
function buildContext(payload: ChatPayload): TurnContext {
  const trip = payload.trip as TripContext;
  const plan = payload.plan;
  const supplied = (payload.recipients ?? []).slice(0, 8).map((person, index) => ({ ...person, ref: `r${index + 1}` }));
  const recipients: KnownRecipient[] = supplied.length ? supplied : plan?.recipient ? [{ ref: "r1", label: plan.recipient, relationship: plan.recipient, groupSize: plan.quantity, allocation: plan.budget }] : [];
  const plannedUnits = payload.plannedUnits ?? plan?.budget ?? 0;
  const allocated = recipients.reduce((sum, person) => sum + (person.allocation ?? 0) * (person.allocationBasis === "per_person" ? person.groupSize ?? 1 : 1), 0);
  const tags = (Array.isArray(payload.preferenceTags) ? payload.preferenceTags : []).map((tag) => `${tag}`);
  const brief = sanitizeBriefPatch({ category: plan?.category ?? null, preference: plan?.preference ?? null, preference_tags: tags.length ? tags : null, route_tag: payload.routeTag ?? null, hotel_delivery: plan?.hotelDelivery ?? null }).patch;
  const declared = (Array.isArray(payload.missingFields) ? payload.missingFields : []).map((field) => `${field}`).filter((field) => (REQUIRED_FIELDS as readonly string[]).includes(field));
  const derived = [!trip?.city && "city", plannedUnits <= 0 && "budget", !recipients.length && "recipients", !brief.preferenceTags?.length && "preferences"].filter((field): field is string => !!field);
  return {
    trip,
    recipients,
    brief,
    plannedUnits,
    unallocatedUnits: payload.unallocatedUnits ?? Math.max(0, plannedUnits - allocated),
    totalKnown: plannedUnits > 0,
    scopeResolved: plannedUnits > 0,
    planApproved: !!payload.planApproved,
    hasPurchases: !!payload.hasPurchases,
    missingFields: [...new Set([...declared, ...derived])],
    // The spare-time window arrives from a client, so it goes through the same door every
    // other client value does. `sanitizeWindow` drops the whole thing on an unknown size and
    // keeps `area` only when the trip already listed it — that check is why a destination
    // cannot become a hotel name and an area cannot become a place the model has not heard of.
    ...(payload.window ? { window: sanitizeWindow(payload.window, trip?.areas ?? []) ?? undefined } : {}),
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", FALLBACK_REPLY);

  // Sign-in is the gate. x-forwarded-for is caller-supplied, so keying the limit on it
  // let anyone reset their own quota by changing one header.
  const traveler = await getTraveler();
  if (!traveler) return fail("unauthenticated", FALLBACK_REPLY);
  // Before the body is even read: the quota exists to stop a call that costs money, and
  // parsing 32KB first would be work done on behalf of a caller already over the line.
  const quota = await chatQuota({ store: burst, key: traveler.id, now: Date.now(), deployed: isDeployed(), canRecord: hasAdminClient(), record: recordHit });
  if (quota !== "ok") return fail("rate_limited", FALLBACK_REPLY);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("too_large", FALLBACK_REPLY);

  let payload: ChatPayload;
  try {
    payload = JSON.parse(raw) as ChatPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = payload.message?.trim().slice(0, MAX_TURN_CHARS) ?? "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (!payload.trip?.city) return Response.json({ error: "trip is required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  // With no key the traveler still gets the regex reading, but as a suggestion they tap to accept.
  const suggested = inferPlanPatch(message);
  if (!apiKey) return fail("no_key", FALLBACK_REPLY, suggested);

  const context = buildContext(payload);
  const history = (payload.history ?? []).slice(-MAX_HISTORY).map((turn) => ({ role: turn.role === "ai" ? ("assistant" as const) : ("user" as const), content: `${turn.text}`.slice(0, MAX_TURN_CHARS) }));

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        // The turn is a short extraction, not a reasoning task — keep latency down.
        reasoning_effort: "none",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: briefContext(context) },
          ...history,
          { role: "user", content: message },
        ],
        response_format: { type: "json_schema", json_schema: { name: "trail_brief_turn", strict: true, schema: TURN_SCHEMA } },
        max_completion_tokens: 900,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      // Never log the response body: OpenAI echoes parts of the request, which carries traveler text.
      console.error("Trail AI upstream error", response.status, response.headers.get("x-request-id"));
      const code: ChatErrorCode = response.status === 429 ? "upstream_429" : "upstream_5xx";
      return fail(code, FALLBACK_REPLY, suggested);
    }

    const completion = (await response.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string } }> };
    const choice = completion.choices?.[0];
    if (choice?.message?.refusal) return fail("refused", FALLBACK_REPLY);
    if (choice?.finish_reason === "length") return fail("truncated", FALLBACK_REPLY, suggested);

    const content = choice?.message?.content;
    if (!content) return fail("parse_failed", FALLBACK_REPLY, suggested);

    let parsed: ModelTurn;
    try {
      parsed = JSON.parse(content) as ModelTurn;
    } catch {
      return fail("parse_failed", FALLBACK_REPLY, suggested);
    }

    // Every rule about what the model may say lives in composeTurn, so it is tested as a function
    // rather than trusted as a paragraph of prompt.
    const body = composeTurn(parsed, context);
    // Only the phrase is kept, never the sentence around it: that sentence is traveler text.
    if (body.hits?.length) console.warn("Trail AI unlisted phrase", body.errorCode, body.hits.length, tripCurrency(context.trip));
    return Response.json(body satisfies ChatReply);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("Trail AI request failed", timedOut ? "timeout" : "network");
    return fail(timedOut ? "timeout" : "upstream_5xx", FALLBACK_REPLY, suggested);
  }
}
