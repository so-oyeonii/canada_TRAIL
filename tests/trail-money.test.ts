import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { amount, currencySymbol, fromMinor, minorUnits, priceLabel, toMinor, CURRENCIES } from "../lib/money/format.ts";

// Cents are meaningless without the currency that says how many of them make one.
// Every screen used to divide by a hard 100, so a 30,000 yen trip read "300" and a
// 1,200 yen purchase was stored as 120,000 — which then fired the over-budget branch
// at a traveller who was well inside their plan.

test("an amount is scaled by its own currency, not by a hundred", () => {
  assert.equal(amount(25000, "CAD"), "250");
  assert.equal(amount(25050, "CAD"), "250.50");
  assert.equal(amount(1250, "EUR"), "12.50");
  assert.equal(amount(30000, "JPY"), "30,000");
  assert.equal(amount(12000, "KRW"), "12,000");
});

test("a label carries the code and the right symbol", () => {
  assert.equal(priceLabel(25000, "CAD"), "CAD $250");
  assert.equal(priceLabel(30000, "JPY"), "JPY ¥30,000");
  assert.equal(priceLabel(12000, "KRW"), "KRW ₩12,000");
  assert.equal(priceLabel(1250, "GBP"), "GBP £12.50");
  assert.equal(priceLabel(1250, "EUR"), "EUR €12.50");
});

test("no cent is ever rounded away, and a negative keeps its sign", () => {
  assert.equal(amount(1, "CAD"), "0.01");
  assert.equal(amount(99, "USD"), "0.99");
  assert.equal(amount(-2550, "CAD"), "−25.50");
  assert.equal(amount(-1, "JPY"), "−1");
});

test("whole units survive the round trip in every currency", () => {
  for (const currency of CURRENCIES) for (const cents of [1, 99, 100, 1250, 25050, 30000, 1234567]) {
    assert.equal(toMinor(fromMinor(cents, currency), currency), cents, `${currency} lost ${cents}`);
  }
});

test("yen and won have no minor unit at all", () => {
  assert.equal(minorUnits("JPY"), 1);
  assert.equal(minorUnits("KRW"), 1);
  assert.equal(toMinor(30000, "JPY"), 30000);
  assert.equal(toMinor(300, "CAD"), 30000);
});

test("a currency nobody has heard of falls back rather than throwing", () => {
  assert.equal(minorUnits("XYZ"), 100);
  assert.equal(minorUnits(null), 100);
  assert.equal(minorUnits(undefined), 100);
  assert.equal(currencySymbol("XYZ"), "");
  assert.equal(amount(25000, "XYZ"), "250");
  assert.equal(priceLabel(25000, "XYZ"), "XYZ 250");
});

test("thousands are grouped without asking the runtime for locale data", () => {
  assert.equal(amount(100000000, "JPY"), "100,000,000");
  assert.equal(amount(100000, "CAD"), "1,000");
  assert.equal(amount(999, "JPY"), "999");
});

// G1 through G6 redraw every one of these screens. This is the only thing standing
// between that and a `$` typed back in front of a yen amount.
const SKIP = ["survey"];      // another workstream owns app/survey; it holds no money
const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
  const path = `${dir}/${entry}`;
  if (SKIP.includes(entry)) return [];
  return statSync(path).isDirectory() ? walk(path) : path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
});
const appRoot = new URL("../app", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("no screen hardcodes a currency symbol in front of an amount", () => {
  const offenders: string[] = [];
  for (const file of walk(appRoot)) {
    const source = readFileSync(file, "utf8");
    if (/\$\s*\{?\s*money\(/.test(source)) offenders.push(`${file}: $ in front of money()`);
    if (/currency\}\s*\$/.test(source)) offenders.push(`${file}: {currency} $ literal`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});
