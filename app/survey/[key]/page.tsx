import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSurvey, isSurveyKey, SURVEY_KEYS } from "@/lib/survey";
import SurveyRunner from "./runner";

/** /survey/ux and /survey/team. Outside the (app) group on purpose: a
 *  respondent has no session, no trip and no tab bar, and the survey must open
 *  for someone who has never signed in. */

export const generateStaticParams = () => SURVEY_KEYS.map((key) => ({ key }));

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  if (!isSurveyKey(key)) return { title: "설문" };
  const survey = getSurvey(key);
  // Internal survey link should not be indexed or unfurled into a chat preview.
  return { title: survey.title, description: survey.lede, robots: { index: false, follow: false } };
}

export default async function SurveyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isSurveyKey(key)) notFound();
  return <SurveyRunner survey={getSurvey(key)} />;
}
