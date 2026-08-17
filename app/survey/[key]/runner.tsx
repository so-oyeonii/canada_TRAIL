"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAnswered, terminatesOn, visible, type Answers, type AnswerValue, type Question, type Stimulus, type Survey } from "@/lib/survey/types";
import "../survey.css";

/** The respondent-facing runner: one section per screen, autosaved on every
 *  advance.
 *
 *  Two decisions worth stating, because both cost something:
 *
 *  1. **Partial responses are saved.** Someone who quits at the wallet task is
 *     the most informative person in the study, and a form that only posts on
 *     the final button throws them away. The cost is a write per section.
 *  2. **A failed save does not block the respondent.** The draft is in
 *     localStorage and the next section retries the whole payload, so a dropped
 *     request costs nothing. Stopping someone mid-survey to report a network
 *     error would lose more data than the error does.
 *
 *  The five-second frame is one-shot on purpose. Letting it be re-opened turns
 *  a first-impression test into a reading-comprehension test. */

type Phase = "intro" | "running" | "screened" | "done";
type Draft = { answers: Answers; furthest: number; timings: Record<string, number>; index: number };

const newSessionKey = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const storageKey = (key: string) => `trail-survey-${key}`;
const sessionStore = (key: string) => `trail-survey-session-${key}`;

export default function SurveyRunner({ survey }: { survey: Survey }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [timings, setTimings] = useState<Record<string, number>>({});
  const [furthest, setFurthest] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [restored, setRestored] = useState(false);
  const session = useRef<string>("");
  const enteredAt = useRef<number>(0);

  const section = survey.sections[index];
  const live = useMemo(() => (section ? section.questions.filter((q) => visible(q, answers)) : []), [section, answers]);
  const missing = useMemo(() => live.filter((q) => !q.optional && !isAnswered(q, answers[q.id])), [live, answers]);

  /** Reading the draft happens on the button, not in an effect.
   *
   *  localStorage cannot be read during a server render, so restoring on mount
   *  means rendering one thing and then immediately replacing it — a cascading
   *  render, and a flash of the wrong screen. The intro screen is identical for
   *  everyone; the draft is picked up the moment they choose to continue. */
  const begin = () => {
    let key = localStorage.getItem(sessionStore(survey.key));
    if (!key) { key = newSessionKey(); localStorage.setItem(sessionStore(survey.key), key); }
    session.current = key;
    try {
      const raw = localStorage.getItem(storageKey(survey.key));
      const draft = raw ? (JSON.parse(raw) as Draft) : null;
      if (draft && (draft.furthest ?? 0) > 0) {
        setAnswers(draft.answers ?? {}); setTimings(draft.timings ?? {});
        setFurthest(draft.furthest); setIndex(Math.min(draft.index ?? 0, survey.sections.length - 1));
        setRestored(true);
      }
    } catch { /* a corrupt draft is a fresh start, not an error screen */ }
    setPhase("running");
    enteredAt.current = Date.now();
  };

  useEffect(() => {
    if (phase === "intro") return;
    localStorage.setItem(storageKey(survey.key), JSON.stringify({ answers, timings, furthest, index } satisfies Draft));
  }, [survey.key, answers, timings, furthest, index, phase]);

  const save = useCallback(async (payload: { answers: Answers; timings: Record<string, number>; furthest: number; completed?: boolean; screenedOut?: boolean }) => {
    try {
      await fetch("/api/survey", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: survey.key, session: session.current, ...payload }),
        keepalive: true,
      });
    } catch { /* the draft survives locally; the next advance resends everything */ }
  }, [survey.key]);

  // An emptied field is an unanswered question, not an empty string: the server
  // validates `number` strictly and would reject "" as a malformed answer.
  const set = (id: string, value: AnswerValue) => setAnswers((prev) => {
    if (value === "") { const next = { ...prev }; delete next[id]; return next; }
    return { ...prev, [id]: value };
  });

  const advance = () => {
    if (missing.length) { setShowErrors(true); document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const spent = Math.round((Date.now() - enteredAt.current) / 1000);
    const nextTimings = { ...timings, [section.id]: (timings[section.id] ?? 0) + spent };
    const screenedOut = live.some((q) => terminatesOn(q, answers[q.id]));
    const last = index + 1 >= survey.sections.length;
    const nextIndex = screenedOut || last ? index : index + 1;
    const nextFurthest = Math.max(furthest, nextIndex + 1);

    setTimings(nextTimings); setShowErrors(false); setRestored(false);
    void save({ answers, timings: nextTimings, furthest: nextFurthest, completed: last && !screenedOut, screenedOut });

    if (screenedOut) { setPhase("screened"); localStorage.removeItem(storageKey(survey.key)); return; }
    if (last) { setPhase("done"); localStorage.removeItem(storageKey(survey.key)); return; }
    setFurthest(nextFurthest); setIndex(nextIndex);
    enteredAt.current = Date.now();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  const back = () => {
    if (index === 0) return;
    const spent = Math.round((Date.now() - enteredAt.current) / 1000);
    setTimings((t) => ({ ...t, [section.id]: (t[section.id] ?? 0) + spent }));
    setIndex(index - 1); setShowErrors(false); enteredAt.current = Date.now();
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  if (phase === "intro") return <Frame survey={survey}>
    <div className="sv-intro">
      <h1>{survey.title}</h1>
      <p className="sv-lede">{survey.lede}</p>
      <ul className="sv-facts"><li>{survey.minutes}</li><li>{survey.anonymity}</li></ul>
      {survey.intro.map((line, i) => <p key={i}>{line}</p>)}
      <button className="sv-primary" onClick={begin}>시작하기</button>
    </div>
  </Frame>;

  if (phase === "screened") return <Frame survey={survey}><div className="sv-end"><h1>감사합니다</h1><p>{survey.screenedOutMessage}</p></div></Frame>;
  if (phase === "done") return <Frame survey={survey}><div className="sv-end"><h1>다 끝났습니다</h1><p>{survey.closing}</p></div></Frame>;

  const progress = Math.round((index / survey.sections.length) * 100);

  return <Frame survey={survey}>
    <div className="sv-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="진행률">
      <i style={{ width: `${progress}%` }} />
    </div>
    <p className="sv-step">{index + 1} / {survey.sections.length}</p>

    {restored && <p className="sv-restored">이전에 답하던 곳부터 이어집니다.</p>}

    <h2 className="sv-section-title">{section.title}</h2>
    {section.note && <p className="sv-note">{section.note}</p>}
    {section.stimuli?.map((s) => <StimulusFigure key={s.slot} stimulus={s} sectionId={section.id} />)}

    <div className="sv-questions">
      {live.map((q) => <Field key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} invalid={showErrors && !q.optional && !isAnswered(q, answers[q.id])} />)}
    </div>

    {showErrors && missing.length > 0 && <p className="sv-error" role="alert">답하지 않은 문항이 {missing.length}개 있습니다.</p>}

    <div className="sv-nav">
      {index > 0 && <button className="sv-secondary" onClick={back}>이전</button>}
      <button className="sv-primary" onClick={advance}>{index + 1 >= survey.sections.length ? "제출하기" : "다음"}</button>
    </div>
  </Frame>;
}

function Frame({ survey, children }: { survey: Survey; children: React.ReactNode }) {
  return <div className="sv-shell"><main className="sv-main">
    <header className="sv-head"><b>TRAIL</b><span>{survey.title}</span></header>
    {children}
  </main></div>;
}

/** A wireframe frame. `timedSeconds` shows it once, counts down, and takes it
 *  away — the respondent cannot re-open it, which is the entire point of a
 *  five-second test. */
function StimulusFigure({ stimulus, sectionId }: { stimulus: Stimulus; sectionId: string }) {
  const [left, setLeft] = useState(stimulus.timedSeconds ?? 0);
  const [broken, setBroken] = useState(false);
  const timed = Boolean(stimulus.timedSeconds);

  useEffect(() => {
    if (!timed) return;
    const deadline = Date.now() + (stimulus.timedSeconds ?? 0) * 1000;
    const tick = setInterval(() => {
      const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remain);
      if (remain === 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [timed, stimulus.timedSeconds, sectionId]);

  const hidden = timed && left === 0;

  return <figure className="sv-stimulus">
    {hidden ? <div className="sv-stimulus-gone">화면이 사라졌습니다. 기억나는 대로 답해 주세요.</div>
      : broken ? <div className="sv-stimulus-missing">자극물 이미지가 없습니다 — <code>/public/survey/{stimulus.slot}.png</code></div>
      : /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`/survey/${stimulus.slot}.png`} alt={stimulus.caption} onError={() => setBroken(true)} loading="eager" />}
    <figcaption>{stimulus.caption}{timed && !hidden && <b> · {left}초</b>}</figcaption>
  </figure>;
}

function Field({ q, value, onChange, invalid }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void; invalid: boolean }) {
  return <section id={`q-${q.id}`} className={`sv-q${invalid ? " is-invalid" : ""}`}>
    <p className="sv-prompt">{q.prompt}{q.optional && <em> (선택)</em>}</p>
    {q.help && <p className="sv-help">{q.help}</p>}
    <Input q={q} value={value} onChange={onChange} />
  </section>;
}

function Scale({ min, max, low, high, na, value, onChange, label }: { min: number; max: number; low: string; high: string; na?: string; value: unknown; onChange: (v: AnswerValue) => void; label: string }) {
  const points = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return <div className="sv-scale" role="group" aria-label={label}>
    <div className="sv-scale-points">
      {points.map((n) => <button key={n} type="button" className={value === n ? "is-on" : ""} aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>)}
      {na && <button type="button" className={`sv-na${value === "na" ? " is-on" : ""}`} aria-pressed={value === "na"} onClick={() => onChange("na")}>{na}</button>}
    </div>
    <div className="sv-scale-anchors"><small>{low}</small><small>{high}</small></div>
  </div>;
}

function Input({ q, value, onChange }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  switch (q.kind) {
    case "consent":
      return <label className="sv-consent">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>{q.label}</span>
      </label>;

    case "single":
      return <div className="sv-choices" role="radiogroup" aria-label={q.prompt}>
        {q.choices.map((c) => <label key={c.value} className={value === c.value ? "is-on" : ""}>
          <input type="radio" name={q.id} checked={value === c.value} onChange={() => onChange(c.value)} /><span>{c.label}</span>
        </label>)}
      </div>;

    case "multi": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => {
        const choice = q.choices.find((c) => c.value === v)!;
        if (choice.exclusive) return onChange(picked.includes(v) ? [] : [v]);
        const exclusives = q.choices.filter((c) => c.exclusive).map((c) => c.value);
        const base = picked.filter((x) => !exclusives.includes(x));
        const next = base.includes(v) ? base.filter((x) => x !== v) : [...base, v];
        if (q.max && next.length > q.max) return;
        onChange(next);
      };
      return <div className="sv-choices">
        {q.max && <p className="sv-help">최대 {q.max}개까지 고를 수 있습니다.</p>}
        {q.choices.map((c) => <label key={c.value} className={picked.includes(c.value) ? "is-on" : ""}>
          <input type="checkbox" checked={picked.includes(c.value)} onChange={() => toggle(c.value)} /><span>{c.label}</span>
        </label>)}
      </div>;
    }

    case "scale":
      return <Scale {...q} value={value} onChange={onChange} label={q.prompt} />;

    case "matrix": {
      const rows = (value as Record<string, unknown>) ?? {};
      return <div className="sv-rows">
        {q.rows.map((r) => <div key={r.id} className="sv-row">
          <p>{r.label}</p>
          <Scale min={q.min} max={q.max} low={q.low} high={q.high} na={q.na} label={r.label}
            value={rows[r.id]} onChange={(v) => onChange({ ...rows, [r.id]: v })} />
        </div>)}
      </div>;
    }

    case "grid": {
      const rows = (value as Record<string, unknown>) ?? {};
      return <div className="sv-rows">
        {q.rows.map((r) => <div key={r.id} className="sv-row">
          <p>{r.label}</p>
          <div className="sv-choices sv-choices-tight" role="radiogroup" aria-label={r.label}>
            {q.choices.map((c) => <label key={c.value} className={rows[r.id] === c.value ? "is-on" : ""}>
              <input type="radio" name={`${q.id}-${r.id}`} checked={rows[r.id] === c.value} onChange={() => onChange({ ...rows, [r.id]: c.value })} /><span>{c.label}</span>
            </label>)}
          </div>
        </div>)}
      </div>;
    }

    case "dual": {
      const rows = (value as Record<string, { l?: number; r?: number }>) ?? {};
      const points = Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i);
      const put = (id: string, side: "l" | "r", n: number) => onChange({ ...rows, [id]: { ...(rows[id] ?? {}), [side]: n } });
      return <div className="sv-rows">
        {q.rows.map((r) => <div key={r.id} className="sv-row">
          <p>{r.label}</p>
          {(["l", "r"] as const).map((side) => <div key={side} className="sv-dual">
            <small>{side === "l" ? q.left : q.right}</small>
            <div className="sv-scale-points">
              {points.map((n) => <button key={n} type="button" className={rows[r.id]?.[side] === n ? "is-on" : ""}
                aria-label={`${r.label} ${side === "l" ? q.left : q.right} ${n}`} aria-pressed={rows[r.id]?.[side] === n}
                onClick={() => put(r.id, side, n)}>{n}</button>)}
            </div>
          </div>)}
        </div>)}
      </div>;
    }

    case "points": {
      const rows = (value as Record<string, number>) ?? {};
      const sum = q.rows.reduce((a, r) => a + (rows[r.id] ?? 0), 0);
      return <div className="sv-points">
        <div className={`sv-points-total${sum === q.total ? " is-ok" : ""}`}>
          합계 <b>{sum}</b> / {q.total}{sum !== q.total && <span> · {q.total - sum > 0 ? `${q.total - sum}점 남음` : `${sum - q.total}점 초과`}</span>}
        </div>
        {q.rows.map((r) => <label key={r.id} className="sv-points-row">
          <span>{r.label}</span>
          <input type="number" inputMode="numeric" min={0} max={q.total} value={rows[r.id] ?? ""} placeholder="0"
            onChange={(e) => { const n = e.target.value === "" ? 0 : Math.max(0, Math.min(q.total, Math.floor(Number(e.target.value) || 0))); onChange({ ...rows, [r.id]: n }); }} />
        </label>)}
      </div>;
    }

    case "number":
      return <label className="sv-number">
        {q.unit && <span>{q.unit}</span>}
        <input type="number" inputMode="numeric" value={value === undefined ? "" : String(value)} min={q.min} max={q.max}
          onChange={(e) => onChange(e.target.value === "" ? "" : Math.floor(Number(e.target.value) || 0))} />
      </label>;

    case "text":
      return q.long
        ? <textarea className="sv-text" rows={4} maxLength={q.max ?? 2000} placeholder={q.placeholder} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
        : <input className="sv-text" type="text" maxLength={q.max ?? 300} placeholder={q.placeholder} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
  }
}
