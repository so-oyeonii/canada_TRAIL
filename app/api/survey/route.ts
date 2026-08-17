import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { asBool, asInt, asString, json, readBody } from "@/lib/api/http";
import { cleanAnswers, cleanTimings, getSurvey, isSurveyKey, SESSION_KEY_RE } from "@/lib/survey";

/** Saves one survey response. Called once per section, not once at the end.
 *
 *  This is the only route in the app that writes a row with no owner, so the two
 *  usual guards are replaced rather than relaxed:
 *
 *  • Identity — there is none, deliberately. `getTraveler()` is not called even
 *    when a traveller happens to be signed in: joining a team member's answers
 *    to their account would make §9 of that survey a lie, and a survey people
 *    do not trust returns worse data than no survey.
 *  • Ownership — `session_key` is a random id the browser minted for itself. It
 *    decides which row to overwrite and nothing else. Someone who guesses
 *    another session key can overwrite that response; they cannot read it, learn
 *    whose it is, or reach any other table. That is the whole threat model, and
 *    it is the price of not identifying respondents.
 *
 *  The rate limit is keyed on the forwarded IP, which is caller-supplied and so
 *  only a speed bump — but it is never written to the row, only held in memory
 *  for the window. Anonymity is a property of the schema (0014), not of this file. */

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000, MAX_WRITES = 120;
const hits = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now(), recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > MAX_WRITES;
}

export async function POST(request: Request) {
  if (!hasAdminClient()) return json({ error: "survey_storage_unconfigured" }, 503);

  const parsed = await readBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const key = asString(body.key, 8);
  if (!isSurveyKey(key)) return json({ error: "unknown_survey" }, 404);
  const session = asString(body.session, 64);
  if (!session || !SESSION_KEY_RE.test(session)) return json({ error: "bad_session" }, 400);

  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

  const survey = getSurvey(key);
  const cleaned = cleanAnswers(survey, body.answers ?? {});
  if (!cleaned.ok) return json({ error: "bad_answer", question: cleaned.badQuestion }, 400);

  const furthest = asInt(body.furthest);
  if (furthest === null || furthest < 0 || furthest > survey.sections.length) return json({ error: "bad_furthest" }, 400);
  const completed = asBool(body.completed) ?? false;
  const screenedOut = asBool(body.screenedOut) ?? false;

  const now = new Date().toISOString();
  const db = createAdminClient();
  const { error } = await db.from("survey_responses").upsert({
    survey_key: key,
    session_key: session,
    answers: cleaned.answers,
    timings: cleanTimings(survey, body.timings),
    furthest,
    completed,
    screened_out: screenedOut,
    updated_at: now,
    // Set once and never cleared: a response that reached the end stays ended
    // even if a later autosave arrives from a tab the respondent left open.
    ...(completed || screenedOut ? { submitted_at: now } : {}),
  }, { onConflict: "survey_key,session_key" });

  if (error) return json({ error: "save_failed", detail: error.message }, 500);
  return json({ saved: true, dropped: cleaned.dropped }, 200);
}
