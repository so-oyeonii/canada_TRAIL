import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FALLBACK_LINK_FAILURE, LINK_FAILURES, linkFailureMessage } from "../lib/auth/link-failure.ts";

// The fragment never reaches the server, anyone can append one, and this is the screen
// that asks for credentials. So a code becomes a sentence only through our own table:
// `error_description` is a string a stranger wrote, and we do not read it aloud.

test("each known code gets our own sentence", () => {
  for (const code of ["missing_code", "exchange_failed", "otp_expired", "access_denied", "dev_no_email", "dev_link_failed"]) {
    assert.equal(linkFailureMessage("", `#error_code=${code}`), LINK_FAILURES[code]);
    assert.ok(LINK_FAILURES[code].length > 0);
  }
});

test("a phone number planted in the fragment never reaches the traveller", () => {
  const hostile = "#error=access_denied&error_description=Your+account+is+locked.+Call+1-800-555-0100+to+restore+access.";
  const shown = linkFailureMessage("", hostile);
  assert.equal(shown, LINK_FAILURES.access_denied);
  assert.ok(!shown.includes("1-800"), "the injected phone number is on screen");
  assert.ok(!shown.includes("locked"), "the injected sentence is on screen");
});

test("an unmapped code falls back to our sentence, not to theirs", () => {
  assert.equal(linkFailureMessage("", "#error_code=server_error&error_description=Call+us"), FALLBACK_LINK_FAILURE);
  assert.equal(linkFailureMessage("?error=whatever", ""), FALLBACK_LINK_FAILURE);
});

test("no code at all is not an error at all", () => {
  assert.equal(linkFailureMessage("", ""), "");
  assert.equal(linkFailureMessage("?next=/", "#access_token=abc"), "");
  assert.equal(linkFailureMessage("", "#error_description=Call+1-800-555-0100"), "");
});

test("our callback's query beats the fragment", () => {
  assert.equal(linkFailureMessage("?error=missing_code", "#error_code=otp_expired"), LINK_FAILURES.missing_code);
});

test("the login screen reads no description of its own", () => {
  const page = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.ok(!/error_description/.test(page.replace(/console\.debug[^;]*;/g, "")), "the login screen is reading error_description again");
  assert.ok(/linkFailureMessage/.test(page), "the login screen stopped using the shared table");
});
