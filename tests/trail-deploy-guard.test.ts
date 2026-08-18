import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { devLoginAllowed, isDeployed, type DeployEnv } from "../lib/env/deployment.ts";

// `/auth/dev-signin` mints a real session with the service key. Its old guard was
// `NODE_ENV !== "production"`, which a Vercel preview satisfies, and it accepted any
// `?email=` — falling back to `signup`, so an unknown address became an account with a
// session on it. Four locks now: not deployed, switched on, that one address, and the
// file is not in the bundle at all.

const LOCAL: DeployEnv = { NODE_ENV: "development", TRAIL_DEV_LOGIN: "on", TRAIL_DEV_LOGIN_EMAIL: "me@example.com" };

test("the one configured account opens it on a local dev build", () => {
  assert.equal(devLoginAllowed("me@example.com", LOCAL), true);
});

test("any other address is refused before a link is ever minted", () => {
  assert.equal(devLoginAllowed("someone.else@example.com", LOCAL), false);
  assert.equal(devLoginAllowed("", LOCAL), false);
});

test("an unset allowlist does not match an empty request", () => {
  assert.equal(devLoginAllowed("", { ...LOCAL, TRAIL_DEV_LOGIN_EMAIL: undefined }), false);
  assert.equal(devLoginAllowed("", { ...LOCAL, TRAIL_DEV_LOGIN_EMAIL: "   " }), false);
  assert.equal(devLoginAllowed("me@example.com", { ...LOCAL, TRAIL_DEV_LOGIN_EMAIL: "" }), false);
});

test("the switch has to be on deliberately", () => {
  assert.equal(devLoginAllowed("me@example.com", { ...LOCAL, TRAIL_DEV_LOGIN: undefined }), false);
  assert.equal(devLoginAllowed("me@example.com", { ...LOCAL, TRAIL_DEV_LOGIN: "true" }), false);
});

test("every Vercel environment counts as deployed, preview included", () => {
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" }, { VERCEL: "1" }, { NODE_ENV: "production" }]) {
    assert.equal(isDeployed(env), true, JSON.stringify(env));
    assert.equal(devLoginAllowed("me@example.com", { ...LOCAL, ...env }), false, JSON.stringify(env));
  }
  assert.equal(isDeployed({ NODE_ENV: "development" }), false);
});

test("case and stray spaces are the same address", () => {
  assert.equal(devLoginAllowed(" Me@Example.com ", LOCAL), true);
  assert.equal(devLoginAllowed("ME@EXAMPLE.COM", { ...LOCAL, TRAIL_DEV_LOGIN_EMAIL: " me@example.com " }), true);
});

test("the route asks the helper, and the file is kept out of the deploy", () => {
  const route = readFileSync(new URL("../app/auth/dev-signin/route.ts", import.meta.url), "utf8");
  assert.match(route, /devLoginAllowed\(email\)/);
  assert.ok(!/NODE_ENV/.test(route), "the route is judging the environment on its own again");
  assert.match(readFileSync(new URL("../.vercelignore", import.meta.url), "utf8"), /^app\/auth\/dev-signin$/m);
});

test("the internal wireframe board does not exist in a deployed build", () => {
  const page = readFileSync(new URL("../app/workflow/page.tsx", import.meta.url), "utf8");
  assert.match(page, /isDeployed\(\)\s*&&?\s*notFound\(\)|if \(isDeployed\(\)\) notFound\(\)/);
  assert.match(page, /robots:\s*\{\s*index:\s*false/);
});
