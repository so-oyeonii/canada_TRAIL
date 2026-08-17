import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { json } from "@/lib/api/http";
import { allQuestions, getSurvey, isSurveyKey, type Question } from "@/lib/survey";

/** One wide CSV per survey — a row per response, a column per variable.
 *
 *  Wide and pre-split, because the alternative is a jsonb blob that somebody
 *  hand-unpacks in a spreadsheet at 2am before the readout. Multi-selects become
 *  one 0/1 column per option, matrices one column per row, the risk grid two.
 *
 *  `session_key` is deliberately **not** exported. It is the one value that
 *  persists in a respondent's browser, and on a seven-person team that is enough
 *  to match a row to a laptop. The row id is exported instead; it identifies a
 *  response and nothing else.
 *
 *  Guarded by a shared token rather than a login: there is no admin role in this
 *  app, and adding one for a CSV would be a larger security surface than a
 *  header. With no token configured the route does not exist. */

export const dynamic = "force-dynamic";

type Row = {
  id: string; answers: Record<string, unknown>; timings: Record<string, number>;
  furthest: number; completed: boolean; screened_out: boolean;
  started_at: string; updated_at: string; submitted_at: string | null;
};

/** Column names for one question, paired with the getter that fills them. */
function columns(q: Question): { name: string; read: (a: Record<string, unknown>) => string }[] {
  const cell = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
  switch (q.kind) {
    case "multi":
      return q.choices.map((c) => ({
        name: `${q.id}__${c.value}`,
        read: (a) => (Array.isArray(a[q.id]) ? ((a[q.id] as string[]).includes(c.value) ? "1" : "0") : ""),
      }));
    case "matrix": case "grid": case "points":
      return q.rows.map((r) => ({ name: `${q.id}__${r.id}`, read: (a) => cell((a[q.id] as Record<string, unknown>)?.[r.id]) }));
    case "dual":
      return q.rows.flatMap((r) => [
        { name: `${q.id}__${r.id}__likelihood`, read: (a) => cell((a[q.id] as Record<string, { l?: number }>)?.[r.id]?.l) },
        { name: `${q.id}__${r.id}__impact`, read: (a) => cell((a[q.id] as Record<string, { r?: number }>)?.[r.id]?.r) },
      ]);
    default:
      return [{ name: q.id, read: (a) => cell(a[q.id]) }];
  }
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(request: Request) {
  const expected = process.env.SURVEY_EXPORT_TOKEN;
  if (!expected) return json({ error: "not_found" }, 404);
  if (request.headers.get("x-survey-export-token") !== expected) return json({ error: "not_found" }, 404);
  if (!hasAdminClient()) return json({ error: "survey_storage_unconfigured" }, 503);

  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  if (!isSurveyKey(key)) return json({ error: "unknown_survey" }, 404);
  const survey = getSurvey(key);
  const onlyComplete = params.get("complete") === "1";

  const db = createAdminClient();
  let query = db.from("survey_responses")
    .select("id, answers, timings, furthest, completed, screened_out, started_at, updated_at, submitted_at")
    .eq("survey_key", key).order("started_at", { ascending: true }).limit(5000);
  if (onlyComplete) query = query.eq("completed", true);
  const { data, error } = await query;
  if (error) return json({ error: "export_failed", detail: error.message }, 500);
  const rows = (data ?? []) as Row[];

  const questionColumns = allQuestions(survey).flatMap(columns);
  const sectionIds = survey.sections.map((s) => s.id);
  const header = [
    "response_id", "completed", "screened_out", "furthest_section", "started_at", "updated_at", "submitted_at",
    ...questionColumns.map((c) => c.name),
    ...sectionIds.map((s) => `seconds__${s}`),
  ];

  const body = rows.map((row) => [
    row.id, row.completed ? "1" : "0", row.screened_out ? "1" : "0", String(row.furthest),
    row.started_at, row.updated_at, row.submitted_at ?? "",
    ...questionColumns.map((c) => c.read(row.answers ?? {})),
    ...sectionIds.map((s) => String((row.timings ?? {})[s] ?? "")),
  ]);

  // BOM so Excel opens the Korean labels as UTF-8 instead of mojibake.
  const csv = "﻿" + [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, { status: 200, headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="trail-survey-${key}.csv"`,
    "Cache-Control": "no-store",
  } });
}
