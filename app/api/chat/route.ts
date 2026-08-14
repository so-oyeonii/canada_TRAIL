import { briefContext, inferPlanPatch, sanitizePatch, FALLBACK_REPLY, PLAN_KEYS, PLAN_SCHEMA, SYSTEM_PROMPT, type ChatErrorCode, type ChatReply, type ChatTurn, type Plan, type PlanPatch, type TripContext } from "../../trail-brief";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_HISTORY = 12;
const MAX_TURN_CHARS = 500;
const MAX_BODY_BYTES = 32 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;

type ChatPayload = { message?: string; plan?: Plan; trip?: TripContext; history?: ChatTurn[] };

/** Per-instance counter. Interim protection only — replaced by a session check once auth lands (P2). */
const hits = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

/** The chat route spends money on every call, so it only answers this app's own pages. */
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches may omit it; the rate limit still applies
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function fail(code: ChatErrorCode, message: string, suggested: PlanPatch = {}) {
  const body: ChatReply = { reply: message, patch: {}, suggested, rejected: [], source: "fallback", errorCode: code };
  return Response.json(body);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("bad_origin", FALLBACK_REPLY);

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  if (rateLimited(forwarded.split(",")[0].trim() || "anonymous")) return fail("rate_limited", FALLBACK_REPLY);

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
  if (!payload.plan || !payload.trip) return Response.json({ error: "plan and trip are required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  // With no key the traveler still gets the regex reading, but as a suggestion they tap to accept.
  const suggested = inferPlanPatch(message);
  if (!apiKey) return fail("no_key", FALLBACK_REPLY, suggested);

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
          { role: "system", content: briefContext(payload.plan, payload.trip) },
          ...history,
          { role: "user", content: message },
        ],
        response_format: { type: "json_schema", json_schema: { name: "trail_brief_turn", strict: true, schema: PLAN_SCHEMA } },
        max_completion_tokens: 800,
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

    let parsed: { reply?: string; patch?: unknown; clear?: unknown };
    try {
      parsed = JSON.parse(content) as { reply?: string; patch?: unknown; clear?: unknown };
    } catch {
      return fail("parse_failed", FALLBACK_REPLY, suggested);
    }

    const { patch, rejected } = sanitizePatch(parsed.patch);
    // `clear` lets the model undo a field the traveler just ruled out. It is the only way a
    // negated message ("not chocolate") can reach the brief.
    // A key can arrive in both `patch` and `clear`; the filled value wins, otherwise the
    // turn would set a field and erase it in the same breath.
    const clear = Array.isArray(parsed.clear) ? parsed.clear.filter((key): key is string => typeof key === "string" && (PLAN_KEYS as string[]).includes(key) && !(key in patch)) : [];
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim().slice(0, 600) : FALLBACK_REPLY;
    const body: ChatReply & { clear: string[] } = { reply, patch, suggested: {}, rejected, clear, source: "model" };
    return Response.json(body);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("Trail AI request failed", timedOut ? "timeout" : "network");
    return fail(timedOut ? "timeout" : "upstream_5xx", FALLBACK_REPLY, suggested);
  }
}
