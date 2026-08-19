import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SURVEY_KEYS, allQuestions, cleanAnswers, cleanTimings, getSurvey, isSurveyKey, SESSION_KEY_RE, WALLET } from "../lib/survey/index.ts";
import { isAnswered, visible, terminatesOn, type Question } from "../lib/survey/types.ts";

const ux = getSurvey("ux"), team = getSurvey("team");
const find = (survey = ux) => (id: string): Question => {
  const q = allQuestions(survey).find((x) => x.id === id);
  assert.ok(q, `no question ${id}`);
  return q;
};
const uxQ = find(ux), teamQ = find(team);

// ── the instruments themselves ───────────────────────────────
// A duplicate id silently overwrites a column in the export and the loss is
// invisible until analysis, so it is caught here instead.
test("every question id is unique within its survey", () => {
  for (const key of SURVEY_KEYS) {
    const ids = allQuestions(getSurvey(key)).map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length, `${key} has duplicate question ids`);
  }
});

test("every section id is unique — timings are keyed on them", () => {
  for (const key of SURVEY_KEYS) {
    const ids = getSurvey(key).sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${key} has duplicate section ids`);
  }
});

/** `readBody` refuses any payload carrying a key it reads as an identity claim,
 *  at any depth. Section ids travel as `timings` keys and question ids as
 *  `answers` keys, so an id called `role` or `auth` would make the survey post
 *  a 400 for everyone — and it would only show up in the field. */
test("no id collides with the identity-key screen in readBody", () => {
  const banned = new Set(["user_id", "userId", "uid", "owner_id", "ownerId", "traveler_id", "travelerId", "auth", "role"]);
  for (const key of SURVEY_KEYS) {
    const survey = getSurvey(key);
    for (const s of survey.sections) assert.ok(!banned.has(s.id), `${key} section ${s.id}`);
    for (const q of allQuestions(survey)) assert.ok(!banned.has(q.id), `${key} question ${q.id}`);
  }
});

test("every showIf points at a question that exists and is asked earlier", () => {
  for (const key of SURVEY_KEYS) {
    const order = allQuestions(getSurvey(key));
    order.forEach((q, at) => {
      if (!q.showIf) return;
      const source = order.findIndex((x) => x.id === q.showIf!.q);
      assert.ok(source >= 0, `${key}: ${q.id} depends on unknown ${q.showIf.q}`);
      assert.ok(source < at, `${key}: ${q.id} depends on ${q.showIf.q}, which is asked later`);
    });
  }
});

test("choice values are unique inside a question", () => {
  for (const key of SURVEY_KEYS) {
    for (const q of allQuestions(getSurvey(key))) {
      if (q.kind !== "single" && q.kind !== "multi" && q.kind !== "grid") continue;
      const values = q.choices.map((c) => c.value);
      assert.equal(new Set(values).size, values.length, `${key}: ${q.id}`);
      if ("rows" in q) { const rows = q.rows.map((r) => r.id); assert.equal(new Set(rows).size, rows.length, `${key}: ${q.id} rows`); }
    }
  }
});

// ── product rules the survey exists to measure ───────────────
/** The prototype prints one budget line, so the money section is scored on
 *  three figures instead of one. If any of them stops being derivable from the
 *  screen, the section stops measuring the thing the budget line can get wrong. */
test("the money task is still scored against the figures on the screen", () => {
  assert.equal(WALLET.left, WALLET.budget - WALLET.spent, "the printed 'left' is budget minus spent");
  assert.equal(WALLET.unallocated, WALLET.budget - WALLET.allocated, "what the four recipients do not hold");
  assert.notEqual(WALLET.left, WALLET.budget - WALLET.spent - WALLET.fee, "the delivery fee is outside the shopping money — mo_fee is keyed on that");
  assert.ok(uxQ("mo_left").kind === "number" && uxQ("mo_free").kind === "number");
});

test("the approval gate and the 'this is only a note' rule are both asked, with a real distractor", () => {
  const gate = uxQ("c_over"), saved = uxQ("sv_save");
  assert.ok(gate.kind === "single" && gate.choices.some((c) => c.value === "propose") && gate.choices.some((c) => c.value === "auto"));
  assert.ok(saved.kind === "single" && saved.choices.some((c) => c.value === "note") && saved.choices.some((c) => c.value === "hold"));
});

/** The eight captures sitting in /public/survey, and nothing else. A stimulus
 *  slot that does not resolve to a file is a grey box in front of a respondent,
 *  and the runner reports it to them rather than to us. Home is in here twice —
 *  `p_home_top` at rest for the first-click task, `p_home` with the proximity
 *  card for the alert section. */
test("every stimulus slot is one of the prototype captures, and resolves to a file", () => {
  const known = new Set(["p_home", "p_home_top", "p_ai", "p_gifts", "p_wishlist", "p_bags", "p_dropoff", "p_tracking"]);
  const shipped = new Set(readdirSync(fileURLToPath(new URL("../public/survey", import.meta.url))));
  for (const s of ux.sections.flatMap((x) => x.stimuli ?? [])) {
    assert.ok(known.has(s.slot), `unknown stimulus slot ${s.slot}`);
    assert.ok(shipped.has(`${s.slot}.png`), `no /public/survey/${s.slot}.png — respondents would be shown the gap`);
  }
});

test("the screener terminates on the two questions that define the sample", () => {
  for (const id of ["s1", "s2"]) {
    const q = uxQ(id);
    assert.ok(terminatesOn(q, "no"), `${id} should screen out`);
    assert.ok(!terminatesOn(q, "yes"), `${id} should keep a qualifier`);
  }
});

test("the team survey judges every build item on the same five-way scale", () => {
  const status = teamQ("status");
  assert.ok(status.kind === "grid");
  assert.equal(status.rows.length, 15);
  assert.ok(status.choices.some((c) => c.value === "unknown"), "'모른다' must be offerable — a forced guess is not data");
});

// ── validation ───────────────────────────────────────────────
test("a well-formed response survives cleaning unchanged", () => {
  const result = cleanAnswers(ux, { consent: true, s1: "yes", s3: ["carried", "gaveup"], fi3: 5, mo_left: 211, b1: { carry: 7, choose: "na" }, liked: "지도" });
  assert.ok(result.ok);
  assert.deepEqual(result.answers.s3, ["carried", "gaveup"]);
  assert.equal(result.answers.mo_left, 211);
  assert.deepEqual(result.answers.b1, { carry: 7, choose: "na" });
});

test("nothing is coerced — a stringified scale is a rejection, not a 5", () => {
  const result = cleanAnswers(ux, { fi3: "5" });
  assert.ok(!result.ok);
  assert.equal(result.badQuestion, "fi3");
});

test("out-of-range and unknown values are refused", () => {
  assert.ok(!cleanAnswers(ux, { fi3: 9 }).ok, "9 is off a 1–7 scale");
  assert.ok(!cleanAnswers(ux, { s1: "maybe" }).ok, "not a listed choice");
  assert.ok(!cleanAnswers(ux, { s3: ["carried", "invented"] }).ok, "not a listed choice");
  assert.ok(!cleanAnswers(ux, { consent: "true" }).ok, "consent is a boolean");
});

test("an exclusive choice cannot travel with others", () => {
  assert.ok(cleanAnswers(ux, { s3: ["none"] }).ok);
  assert.ok(!cleanAnswers(ux, { s3: ["none", "carried"] }).ok);
});

test("a capped multi-select refuses an over-long answer", () => {
  assert.ok(cleanAnswers(team, { must: ["deploy", "catalog", "map"] }).ok);
  assert.ok(!cleanAnswers(team, { must: ["deploy", "catalog", "map", "pwa"] }).ok);
});

test("a points allocation may be partial but never over budget", () => {
  assert.ok(cleanAnswers(team, { points: { deploy: 40 } }).ok, "mid-survey saves are partial");
  assert.ok(cleanAnswers(team, { points: { deploy: 60, catalog: 40 } }).ok);
  assert.ok(!cleanAnswers(team, { points: { deploy: 60, catalog: 50 } }).ok);
  assert.ok(!cleanAnswers(team, { points: { deploy: -10, catalog: 50 } }).ok);
});

test("the risk grid keeps likelihood and impact separate and in range", () => {
  assert.ok(cleanAnswers(team, { risks: { nopartner: { l: 4, r: 5 } } }).ok);
  assert.ok(!cleanAnswers(team, { risks: { nopartner: { l: 4, r: 6 } } }).ok);
  assert.ok(!cleanAnswers(team, { risks: { nopartner: { l: 4 } } }).ok, "half a pair is not an answer");
});

/** A renamed question must not strand a respondent who started before the
 *  deploy: their unknown key is dropped, the rest of the response is kept. */
test("unknown question ids are dropped, not fatal", () => {
  const result = cleanAnswers(ux, { fi3: 5, q_from_last_week: "whatever" });
  assert.ok(result.ok);
  assert.deepEqual(result.dropped, ["q_from_last_week"]);
  assert.equal(result.answers.fi3, 5);
});

test("timings accept known sections only, clamped to an hour", () => {
  assert.deepEqual(cleanTimings(ux, { money: 90, made_up: 10, first: 999999 }), { money: 90, first: 3600 });
  assert.deepEqual(cleanTimings(ux, "nope"), {});
});

test("session keys are random hex of a known length", () => {
  assert.ok(SESSION_KEY_RE.test("a".repeat(32)));
  assert.ok(!SESSION_KEY_RE.test("short"));
  assert.ok(!SESSION_KEY_RE.test("../../etc/passwd"));
});

test("only the two known surveys resolve", () => {
  assert.ok(isSurveyKey("ux") && isSurveyKey("team"));
  assert.ok(!isSurveyKey("admin") && !isSurveyKey("") && !isSurveyKey(undefined));
});

// ── runner rules ─────────────────────────────────────────────
test("a question is unanswered until it is fully answered", () => {
  assert.ok(!isAnswered(uxQ("consent"), false));
  assert.ok(isAnswered(uxQ("consent"), true));
  assert.ok(!isAnswered(uxQ("s3"), []));
  assert.ok(!isAnswered(uxQ("liked"), "   "), "whitespace is not an answer");
  assert.ok(!isAnswered(uxQ("b1"), { carry: 7 }), "a matrix needs every row");
  assert.ok(isAnswered(uxQ("b1"), { carry: 7, choose: 3, budget: 4, route: 2 }));
});

test("a hundred-point allocation is unanswered until it sums to a hundred", () => {
  const q = teamQ("points");
  assert.ok(!isAnswered(q, { deploy: 90 }));
  assert.ok(isAnswered(q, { deploy: 60, catalog: 40 }));
});

test("follow-ups appear only for the answers that earn them", () => {
  const why = uxQ("sv_why");
  assert.ok(visible(why, { sv_instock: 3 }), "a low rating asks why");
  assert.ok(!visible(why, { sv_instock: 6 }), "a high rating does not");
  assert.ok(!visible(why, {}));
  assert.ok(visible(uxQ("fi3"), {}), "an unconditional question is always shown");
});

// ── the price of being ownerless ─────────────────────────────
/** `tests/trail-transfers.test.ts` exempts the two survey routes from the
 *  identity checks every other route passes, because a survey response has no
 *  owner to check against. These are the guards that replace them: the exemption
 *  buys exactly one table and nothing else. */
const routeSource = (name: string) => readFileSync(new URL(`../app/api/survey/${name}`, import.meta.url), "utf8");
/** Comments in these files describe the very calls the guards forbid, so the
 *  guards read the code with the prose taken out. */
const routeCode = (name: string) => routeSource(name).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the survey routes touch survey_responses and nothing else", () => {
  for (const name of ["route.ts", "export/route.ts"]) {
    const tables = [...routeSource(name).matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(tables)], ["survey_responses"], `${name} reaches beyond the survey table`);
  }
});

test("the survey routes never read an identity, even when one is available", () => {
  for (const name of ["route.ts", "export/route.ts"]) {
    assert.ok(!/getTraveler\(/.test(routeCode(name)), `${name} joins a response to an account`);
  }
});

/** The forwarded IP is read for rate limiting and must die with the request.
 *  Checking the written columns rather than the file is the only version of
 *  this assertion that stays true when the route is refactored. */
test("the saved row carries no column that was not designed to be anonymous", () => {
  const source = routeCode("route.ts");
  const from = source.indexOf(".upsert({"), to = source.indexOf("}, { onConflict", from);
  assert.ok(from > 0 && to > from, "could not find the upsert payload — fix this test before trusting it");
  const keys = [...source.slice(from, to).matchAll(/([a-z_]+):/g)].map((m) => m[1]);
  const allowed = ["survey_key", "session_key", "answers", "timings", "furthest", "completed", "screened_out", "updated_at", "submitted_at"];
  for (const key of keys) assert.ok(allowed.includes(key), `the survey row now writes "${key}", which nobody reviewed for anonymity`);
  assert.ok(keys.includes("answers"), "the payload parse found nothing");
});

test("the export route does not exist without its token", () => {
  const source = routeSource("export/route.ts");
  assert.ok(/const expected = process\.env\.SURVEY_EXPORT_TOKEN;\s+if \(!expected\) return json\(\{ error: "not_found" \}, 404\);/.test(source), "the token must be the first thing checked");
  assert.ok(/x-survey-export-token"\) !== expected\) return json\(\{ error: "not_found" \}, 404\)/.test(source), "a wrong token must 404, not 401 — the route should not advertise itself");
  const selected = source.match(/\.select\("([^"]*)"\)/);
  assert.ok(selected && !selected[1].includes("session_key"), "session_key is the one value that persists in a respondent's browser; it must not leave the database");
});

test("no other route reaches the survey table", () => {
  const root = fileURLToPath(new URL("../app/api", import.meta.url));
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => { const full = `${dir}/${entry}`; return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : []; });
  for (const path of walk(root)) {
    if (path.split("\\").join("/").includes("/api/survey/")) continue;
    assert.ok(!/survey_responses/.test(readFileSync(path, "utf8")), `${path} reads survey responses`);
  }
});

/** The runner's "is this answered?" and the server's "is this valid?" have to
 *  agree, or a respondent gets waved past a question whose save is then refused
 *  — and the runner is deliberately silent about refused saves. */
test("what the runner accepts, the server accepts", () => {
  const risks = teamQ("risks");
  assert.ok(risks.kind === "dual");
  const halfPairs = Object.fromEntries(risks.rows.map((r) => [r.id, { l: 3 }]));
  assert.ok(!isAnswered(risks, halfPairs), "the runner must not wave a half-filled grid through");
  assert.ok(!cleanAnswers(team, { risks: halfPairs }).ok, "the server refuses it, which is why the runner must too");

  const full = Object.fromEntries(risks.rows.map((r) => [r.id, { l: 3, r: 4 }]));
  assert.ok(isAnswered(risks, full));
  assert.ok(cleanAnswers(team, { risks: full }).ok);
});
