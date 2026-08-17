/** Question shapes for the two survey instruments.
 *
 *  The definitions in `ux.ts` and `team.ts` are plain data on purpose: the same
 *  module is imported by the client runner (to render) and by /api/survey (to
 *  validate). A question that only the browser knows about is a question the
 *  server would have to accept blindly, and this table is written by strangers.
 *
 *  `showIf` is declarative rather than a predicate for the same reason — a
 *  function would render on the client and be unenforceable on the server. */

export type Choice = { value: string; label: string; exclusive?: boolean; terminate?: boolean };
export type Row = { id: string; label: string };
export type Show = { q: string; has: string[] };

type Base = { id: string; prompt: string; help?: string; optional?: boolean; showIf?: Show };

export type Question =
  | (Base & { kind: "consent"; label: string })
  | (Base & { kind: "single"; choices: Choice[] })
  | (Base & { kind: "multi"; choices: Choice[]; max?: number })
  | (Base & { kind: "scale"; min: number; max: number; low: string; high: string; na?: string })
  | (Base & { kind: "matrix"; rows: Row[]; min: number; max: number; low: string; high: string; na?: string })
  | (Base & { kind: "grid"; rows: Row[]; choices: Choice[] })
  | (Base & { kind: "dual"; rows: Row[]; left: string; right: string; min: number; max: number })
  | (Base & { kind: "points"; rows: Row[]; total: number })
  | (Base & { kind: "number"; unit?: string; min?: number; max?: number })
  | (Base & { kind: "text"; long?: boolean; placeholder?: string; max?: number });

export type Kind = Question["kind"];

/** One screen. Keeping a section to one idea is what makes the timings usable:
 *  `timings[sectionId]` is then "how long did the wallet task take", not noise. */
export type Section = { id: string; title: string; note?: string; stimuli?: Stimulus[]; questions: Question[] };

/** A wireframe frame shown above the questions. `slot` maps to /survey/<slot>.png
 *  so swapping the picture never touches this file. */
export type Stimulus = { slot: string; caption: string; timedSeconds?: number };

export type Survey = {
  key: "ux" | "team";
  title: string;
  lede: string;
  minutes: string;
  anonymity: string;
  intro: string[];
  sections: Section[];
  closing: string;
  screenedOutMessage: string;
};

export type AnswerValue = boolean | string | number | string[] | Record<string, unknown>;
export type Answers = Record<string, AnswerValue>;

export const isAnswered = (q: Question, v: AnswerValue | undefined): boolean => {
  if (v === undefined || v === null) return false;
  switch (q.kind) {
    case "consent": return v === true;
    case "multi": return Array.isArray(v) && v.length > 0;
    case "text": return typeof v === "string" && v.trim().length > 0;
    case "matrix": case "grid": return typeof v === "object" && Object.keys(v as object).length === q.rows.length;
    // Both axes or neither. Counting keys would let a respondent rate likelihood
    // on all seven risks, pass this check, and have the server refuse the half
    // pair — a rejected save the runner never shows them.
    case "dual": { if (typeof v !== "object") return false; const rows = v as Record<string, { l?: number; r?: number }>; return q.rows.every((r) => typeof rows[r.id]?.l === "number" && typeof rows[r.id]?.r === "number"); }
    case "points": { if (typeof v !== "object") return false; const sum = Object.values(v as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0); return sum === q.total; }
    default: return v !== "";
  }
};

export const visible = (q: Question, answers: Answers): boolean => {
  if (!q.showIf) return true;
  const v = answers[q.showIf.q];
  if (Array.isArray(v)) return v.some((x) => q.showIf!.has.includes(String(x)));
  return q.showIf.has.includes(String(v));
};

/** A terminating choice is the screener saying "not this person". It is recorded,
 *  not discarded — the screen-out rate is a finding about recruitment. */
export const terminatesOn = (q: Question, v: AnswerValue | undefined): boolean =>
  q.kind === "single" && typeof v === "string" && Boolean(q.choices.find((c) => c.value === v)?.terminate);
