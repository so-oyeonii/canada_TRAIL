import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

// Product rule 1 says the traveller approves every budget change. Until 0013 the
// API was the only thing enforcing it: `plans` and `budget_changes` carried the
// owner `for all` policy, so a browser with the publishable key could approve its
// own proposal. These are the assertions that say the database enforces it now.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/0013_approval_is_server_owned.sql");

const routeSources = () => {
  const found: { path: string; source: string }[] = [];
  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) walk(child);
      else if (entry.name === "route.ts") found.push({ path: child.pathname, source: readFileSync(child, "utf8") });
    }
  };
  walk(new URL("../app/api/", import.meta.url));
  return found;
};

test("a browser can no longer write a plan or decide a change", () => {
  assert.match(migration, /revoke update, delete on public\.plans from authenticated/);
  assert.match(migration, /revoke update, delete on public\.budget_changes from authenticated/);
  assert.match(migration, /drop policy if exists plans_owner on public\.plans/);
  assert.match(migration, /drop policy if exists budget_changes_owner on public\.budget_changes/);
});

test("the one insert a browser keeps is a trip's first draft plan", () => {
  const policy = migration.slice(migration.indexOf("create policy plans_first_draft_insert"));
  for (const clause of ["status = 'draft'", "version = 1", "approved_at is null", "not exists (select 1 from public.plans p where p.trip_id = trip_id)"]) {
    assert.ok(policy.includes(clause), `plans_first_draft_insert is missing: ${clause}`);
  }
});

test("proposing stays open and deciding does not", () => {
  const policy = migration.slice(migration.indexOf("create policy budget_changes_propose"));
  assert.ok(policy.includes("status = 'proposed'"), "a browser could insert an already-approved change");
  assert.ok(policy.includes("decided_at is null"), "a browser could insert a change that was already decided");
  assert.ok(policy.includes("proposed_by <> 'approval'"), "`approval` is the tap, not the ask");
});

test("an approved plan event cannot come from a browser", () => {
  const policy = migration.slice(migration.indexOf("create policy plan_events_insert"));
  assert.ok(policy.includes("stage = 'draft'"), "the ledger would accept a forged approval");
  assert.ok(policy.includes("actor <> 'approval'"), "the ledger would accept a forged approver");
});

test("only the service key may execute the two decision functions", () => {
  for (const fn of ["approve_budget_change", "reject_budget_change"]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
  }
  // Invoker, not definer: every table here is `force row level security`, so a
  // definer function would be leaning on the owner's BYPASSRLS bit instead.
  assert.equal(migration.match(/security definer/g), null);
  assert.equal((migration.match(/security invoker set search_path = ''/g) ?? []).length, 2);
});

test("the approval writes plan, allocations and the claim in one transaction", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.approve_budget_change"), migration.indexOf("create or replace function public.reject_budget_change"));
  assert.ok(fn.includes("for update"), "concurrent taps must serialise on the change row");
  assert.ok(/update public\.plans/.test(fn) && /public\.plan_allocations/.test(fn) && /update public\.budget_changes set status = 'approved'/.test(fn), "all three writes belong in the function");
  assert.ok(fn.includes("get diagnostics"), "a plan update that wrote nothing must raise, not return success");
  assert.ok(fn.includes("'approval'") && fn.includes("'approved'"), "the approval must leave a plan event");
});

test("no route updates a plan or a budget change on its own any more", () => {
  for (const { path, source } of routeSources()) {
    assert.ok(!/from\("plans"\)\s*\.update\(/.test(source), `${path} still updates plans directly`);
    assert.ok(!/from\("budget_changes"\)\s*\.update\(/.test(source), `${path} still decides a budget change directly`);
    // An approved plan event may only be written with the service key, so the
    // client it is written through has to be one bound to that key.
    for (const call of source.match(/(\w+)\.from\("plan_events"\)\.insert\(\{[^}]*\}/g) ?? []) {
      if (!/stage: "approved"/.test(call)) continue;
      const client = call.slice(0, call.indexOf("."));
      assert.match(source, new RegExp(String.raw`const ${client}(: [^=]+)? = (createAdminClient\(\)|adminOrNull\(\)|admin\b)`), `${path} writes an approved plan event through the session client`);
    }
  }
});

test("the tap does not half-happen when the service key is missing", () => {
  const decide = read("lib/budget/decide.ts");
  assert.ok(/adminOrNull\(\)/.test(decide), "the decision must go through the service key");
  assert.ok(/status: 503/.test(decide), "a missing service key is a 503, not a partial approval");
  assert.ok(/rpc\("?approve_budget_change|rpc\(fn/.test(decide), "the approval must go through the function");
});

test("the decision routes name the traveller from the session, never from the body", () => {
  for (const file of ["app/api/budget-changes/[id]/approve/route.ts", "app/api/budget-changes/[id]/reject/route.ts"]) {
    const source = read(file);
    assert.match(source, /const db = await createClient\(\), uid = traveler\.id/);
    assert.ok(/(approve|reject)BudgetChange\(id, uid,/.test(source), `${file} must pass the session's own user id`);
  }
});
