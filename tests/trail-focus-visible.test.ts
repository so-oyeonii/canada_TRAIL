import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// `input:focus-visible` in the base rule has the same specificity as `.chat-input input`,
// so a later `outline:0` won and the ring was simply never drawn — on the chat input, the
// trip form, the profile form, the login form and onboarding. Every screen a keyboard-only
// traveller meets first. The fix is to narrow each silencer to `:not(:focus-visible)`, which
// keeps "no ring on a mouse click" and stops eating the keyboard one.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const FILES = ["app/globals.css", "app/login/login.css", "app/handsfree.css", "app/profile.css", "app/onboarding/onboarding.css"];

/** Split a selector list on commas that are not inside `:is()` / `:not()` / `:where()`. */
function selectors(list: string) {
  const out: string[] = [];
  let depth = 0, current = "";
  for (const char of list) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (char === "," && depth === 0) { out.push(current); current = ""; } else current += char;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

test("nothing silences an outline without excusing the keyboard ring", () => {
  const offenders: string[] = [];
  for (const file of FILES) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, head, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/outline\s*:\s*(0|none)\b/.test(body)) continue;
      for (const selector of selectors(head)) {
        if (!selector.includes(":not(:focus-visible)")) offenders.push(`${file} — ${selector}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `these selectors remove the focus ring outright:\n${offenders.join("\n")}`);
});

test("the base focus ring is still there to win", () => {
  const css = read("app/globals.css");
  assert.match(css, /button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,\[tabindex\]:focus-visible\{outline:3px solid var\(--focus\)/);
  assert.match(css, /outline-offset:2px/);
});
