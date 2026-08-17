import type { Answers, AnswerValue, Question, Survey } from "./types.ts";
import { uxSurvey } from "./ux.ts";
import { teamSurvey } from "./team.ts";

export * from "./types.ts";
export { uxSurvey, teamSurvey };
export { WALLET } from "./ux.ts";

export const SURVEYS = { ux: uxSurvey, team: teamSurvey } as const;
export type SurveyKey = keyof typeof SURVEYS;
export const SURVEY_KEYS = Object.keys(SURVEYS) as SurveyKey[];
export const isSurveyKey = (v: unknown): v is SurveyKey => typeof v === "string" && v in SURVEYS;
export const getSurvey = (key: SurveyKey): Survey => SURVEYS[key];

export const allQuestions = (survey: Survey): Question[] => survey.sections.flatMap((s) => s.questions);

const TEXT_CAP = 2000;
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && Number.isFinite(v) ? v : null);
const inRange = (n: number | null, min: number, max: number) => (n !== null && n >= min && n <= max ? n : null);
const rowIds = (q: Extract<Question, { rows: unknown }>) => new Set(q.rows.map((r) => r.id));

/** One question's answer, or null if the shape is wrong.
 *
 *  Nothing is coerced. A scale that arrives as the string "7" is a bug in the
 *  runner, not a 7, and silently accepting it would put two types in one export
 *  column three weeks from now when nobody remembers why. */
function clean(q: Question, v: unknown): AnswerValue | null {
  switch (q.kind) {
    case "consent":
      return v === true ? true : null;
    case "single":
      return typeof v === "string" && q.choices.some((c) => c.value === v) ? v : null;
    case "multi": {
      if (!Array.isArray(v)) return null;
      const allowed = new Set(q.choices.map((c) => c.value));
      const picked = [...new Set(v.filter((x): x is string => typeof x === "string"))].filter((x) => allowed.has(x));
      if (picked.length !== v.length) return null;
      if (q.max && picked.length > q.max) return null;
      // An exclusive choice ("none of these") cannot travel with anything else.
      const exclusive = q.choices.filter((c) => c.exclusive).map((c) => c.value);
      if (picked.length > 1 && picked.some((x) => exclusive.includes(x))) return null;
      return picked;
    }
    case "scale":
      if (q.na && v === "na") return "na";
      return inRange(int(v), q.min, q.max);
    case "matrix": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      const ids = rowIds(q), out: Record<string, number | string> = {};
      for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
        if (!ids.has(k)) continue;
        if (q.na && raw === "na") { out[k] = "na"; continue; }
        const n = inRange(int(raw), q.min, q.max);
        if (n === null) return null;
        out[k] = n;
      }
      return out;
    }
    case "grid": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      const ids = rowIds(q), allowed = new Set(q.choices.map((c) => c.value)), out: Record<string, string> = {};
      for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
        if (!ids.has(k)) continue;
        if (typeof raw !== "string" || !allowed.has(raw)) return null;
        out[k] = raw;
      }
      return out;
    }
    case "dual": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      const ids = rowIds(q), out: Record<string, { l: number; r: number }> = {};
      for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
        if (!ids.has(k) || !raw || typeof raw !== "object") continue;
        const pair = raw as { l?: unknown; r?: unknown };
        const l = inRange(int(pair.l), q.min, q.max), r = inRange(int(pair.r), q.min, q.max);
        if (l === null || r === null) return null;
        out[k] = { l, r };
      }
      return out;
    }
    case "points": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      const ids = rowIds(q), out: Record<string, number> = {};
      let sum = 0;
      for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
        if (!ids.has(k)) continue;
        const n = inRange(int(raw), 0, q.total);
        if (n === null) return null;
        out[k] = n; sum += n;
      }
      // Partial saves are legitimate mid-survey; overshooting the budget is not.
      return sum <= q.total ? out : null;
    }
    case "number":
      return inRange(int(v), q.min ?? 0, q.max ?? Number.MAX_SAFE_INTEGER);
    case "text":
      return typeof v === "string" ? v.slice(0, q.max ?? TEXT_CAP) : null;
  }
}

export type CleanResult = { ok: true; answers: Answers; dropped: string[] } | { ok: false; badQuestion: string };

/** Unknown ids are dropped rather than refused: a respondent who started before
 *  a deploy should not lose their session because a question was renamed. A
 *  *known* id with a malformed value is refused, because that is the runner
 *  disagreeing with the schema and both sides need to hear about it. */
export function cleanAnswers(survey: Survey, raw: unknown): CleanResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, badQuestion: "__root__" };
  const byId = new Map(allQuestions(survey).map((q) => [q.id, q]));
  const answers: Answers = {}, dropped: string[] = [];
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const q = byId.get(id);
    if (!q) { dropped.push(id); continue; }
    if (value === undefined || value === null) continue;
    const cleaned = clean(q, value);
    if (cleaned === null) return { ok: false, badQuestion: id };
    answers[id] = cleaned;
  }
  return { ok: true, answers, dropped };
}

/** Section ids are the only keys allowed in `timings`, and a number of seconds
 *  is the only value. Bounded so a tab left open overnight cannot claim a
 *  respondent spent 40,000 seconds on the wallet. */
export function cleanTimings(survey: Survey, raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const ids = new Set(survey.sections.map((s) => s.id)), out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(k)) continue;
    const n = int(v);
    if (n !== null && n >= 0) out[k] = Math.min(n, 3600);
  }
  return out;
}

export const SESSION_KEY_RE = /^[a-z0-9]{16,64}$/;
