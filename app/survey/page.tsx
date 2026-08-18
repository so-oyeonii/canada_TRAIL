import Link from "next/link";
import type { Metadata } from "next";
import { SURVEY_KEYS, getSurvey } from "@/lib/survey";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import "./survey.css";

export const metadata: Metadata = { title: "TRAIL 설문", robots: { index: false, follow: false } };
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
  return <div className="sv-shell" lang="ko"><main className="sv-main">
    <header className="sv-head"><b>TRAIL</b><span>설문</span></header>

    {!ready && <p className="sv-blocked" role="alert">
      <b>응답이 저장되지 않습니다.</b>
      아직 설문을 배포하지 마세요. <code>supabase/migrations/0014_survey_responses.sql</code>을 적용하고
      <code>SUPABASE_SERVICE_ROLE_KEY</code>가 설정됐는지 확인한 뒤 이 페이지를 새로고침하면 이 경고가 사라집니다.
    </p>}

    <h1 className="sv-section-title">진행 중인 설문</h1>
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
