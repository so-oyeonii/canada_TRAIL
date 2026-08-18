import Link from "next/link";
import type { Metadata } from "next";
import { SURVEY_KEYS, getSurvey } from "@/lib/survey";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import "./survey.css";

export const metadata: Metadata = { title: "TRAIL surveys", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** A plain index so one URL can be handed to both audiences, and — more
 *  usefully — the one place that says out loud whether responses are actually
 *  being stored.
 *
 *  The runner deliberately never shows a respondent a save error: stopping
 *  someone mid-survey to report a network problem loses more data than the
 *  problem does. The cost of that choice is that a missing migration looks
 *  exactly like a working survey, right up until the export comes back empty.
 *  This check is what makes that failure loud to the person sending the link
 *  instead of silent until the readout. */
async function storageReady(): Promise<boolean> {
  if (!hasAdminClient()) return false;
  try {
    // A real row read, not `head: true`: PostgREST answers a HEAD against a
    // table it has never heard of with 204 and no error, so the cheap version of
    // this check reports a healthy survey right up until the export is empty.
    const { error } = await createAdminClient().from("survey_responses").select("id").limit(1);
    return !error;
  } catch { return false; }
}

export default async function SurveyIndex() {
  const ready = await storageReady();
  return <div className="sv-shell"><main className="sv-main">
    <header className="sv-head"><b>TRAIL</b><span>Surveys</span></header>

    {!ready && <p className="sv-blocked" role="alert">
      <b>Responses are not being stored.</b>
      Do not send these links out yet. Apply <code>supabase/migrations/0014_survey_responses.sql</code>, check that
      <code>SUPABASE_SERVICE_ROLE_KEY</code> is set, then reload this page — the warning goes when storage answers.
    </p>}

    <h1 className="sv-section-title">Open surveys</h1>
    <div className="sv-list">
      {SURVEY_KEYS.map((key) => {
        const survey = getSurvey(key);
        return <Link key={key} className="sv-card" href={`/survey/${key}`}>
          <i>{survey.minutes}</i>
          <b>{survey.title}</b>
          <small>{survey.lede}</small>
          <small>{survey.anonymity}</small>
        </Link>;
      })}
    </div>
  </main></div>;
}
