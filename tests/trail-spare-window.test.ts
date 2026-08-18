import assert from "node:assert/strict";
import test from "node:test";
import { walkMinutesBetween } from "../lib/discovery/distance.ts";
import { BUFFER_MINUTES, HEAVY_GRAMS, SPARE_BANDS, chipFromFreeTime, fit, minutesUntilClock, rankSpare, reachLabel, sizeOf, spareBand } from "../lib/discovery/window.ts";

// The arithmetic of a spare hour. Every assertion here is about one thing: the screen may
// print the walk, and it may not print anything it worked out on top of the walk.

const KENSINGTON = { lat: 43.6547, lng: -79.4009 };

test("the buffer is never zero", () => {
  // It stands in for the queue, the till and the wrong door — terms the arithmetic has no
  // other way to carry. At zero this file would be claiming the walk is the whole cost.
  assert.ok(BUFFER_MINUTES > 0, "a zero buffer is an optimistic window, which is the failure this constant exists to prevent");
});

test("the round trip is counted twice, not once", () => {
  // Out and back. Counting the walk once was the bug this test exists to keep out.
  assert.equal(fit({ minutesLeft: 30, walk: 9 }).browse, 30 - 18 - BUFFER_MINUTES);
  assert.equal(fit({ minutesLeft: 60, walk: 8 }).browse, 60 - 16 - BUFFER_MINUTES);
});

test("bands are labels, and a label carries no number", () => {
  assert.equal(spareBand({ minutesLeft: 60, walk: 8 }), "Time to browse");
  assert.equal(spareBand({ minutesLeft: 45, walk: 10 }), "In and out");
  assert.equal(spareBand({ minutesLeft: 30, walk: 12 }), "Beyond this window");
  // Four unknowns stack up behind that leftover. "About 20 minutes" is not one of them.
  for (const band of SPARE_BANDS) assert.equal(/\d/.test(band), false, band);
});

test("no position means no minutes anywhere, not an estimated one", () => {
  assert.equal(walkMinutesBetween(null, { lat: 43.65, lng: -79.4 }), null);
  assert.deepEqual(fit({ minutesLeft: 60, walk: null }), { browse: null, band: null });
  assert.equal(/\d/.test(reachLabel(null, true)), false);
  assert.equal(/\d/.test(reachLabel(null, false)), false);
  assert.notEqual(reachLabel(null, true), reachLabel(null, false));
  // With a fix there is exactly one number on the card, and it came out of a distance.
  assert.equal(reachLabel(walkMinutesBetween(KENSINGTON, { lat: 43.6489, lng: -79.3956 })), "10 min walk");
});

test("minutes collapse to a size, and 45-75 is one bucket", () => {
  assert.equal(sizeOf(30), "under_an_hour");
  assert.equal(sizeOf(44), "under_an_hour");
  assert.equal(sizeOf(45), "about_an_hour");
  assert.equal(sizeOf(60), "about_an_hour");
  assert.equal(sizeOf(75), "about_an_hour");
  assert.equal(sizeOf(90), "a_couple_of_hours");
  assert.equal(sizeOf(210), "a_couple_of_hours");
  assert.equal(sizeOf(240), "half_a_day");
});

test("`trips.free_time` only ever seeds a chip that exists", () => {
  assert.equal(chipFromFreeTime("1 hour"), 60);
  assert.equal(chipFromFreeTime("2 hours"), 120);
  assert.equal(chipFromFreeTime("3 hours"), 120, "a value with no chip snaps to one rather than inventing a fifth");
  assert.equal(chipFromFreeTime("Full day"), 120);
  assert.equal(chipFromFreeTime(null), null);
  assert.equal(chipFromFreeTime("whenever"), null, "an unreadable string is not a default");
});

test("`Until` is read in the trip's zone, and a time already past opens nothing", () => {
  // 14:00 in Toronto is 18:00 UTC. A phone still on another clock must not decide this.
  const now = new Date("2026-08-18T18:00:00Z");
  assert.equal(minutesUntilClock("15:30", "America/Toronto", now), 90);
  assert.equal(minutesUntilClock("13:00", "America/Toronto", now), null, "a clock already past today is no window, not a small one");
  assert.equal(minutesUntilClock("", "America/Toronto", now), null);
  // The same wall clock in another zone is a different answer, which is the point.
  assert.notEqual(minutesUntilClock("15:30", "Europe/Paris", now), 90);
});

test("a row beyond the window is moved down the list, never out of it", () => {
  const rows = [
    { id: "far", handling: "Standard" as const, weightGrams: 200, walk: 14 },
    { id: "near", handling: "Standard" as const, weightGrams: 200, walk: 3 },
  ];
  const ranked = rankSpare(rows, { minutesLeft: 40, cutoffState: "open" });
  assert.equal(ranked.length, rows.length, "ranking never removes a row");
  assert.equal(ranked[0].id, "near");
  assert.equal(spareBand({ minutesLeft: 40, walk: 14 }), "Beyond this window");
  assert.ok(ranked.some((row) => row.id === "far"), "`Beyond this window` is a position, not a filter");
});

test("weight only sinks a row once tonight's bags belong to the traveller", () => {
  const rows = [
    { id: "heavy", handling: "Standard" as const, weightGrams: HEAVY_GRAMS, walk: 4 },
    { id: "light", handling: "Standard" as const, weightGrams: 100, walk: 5 },
  ];
  assert.equal(rankSpare(rows, { minutesLeft: 60, cutoffState: "open" })[0].id, "heavy", "with the run still open, the shorter walk wins");
  assert.equal(rankSpare(rows, { minutesLeft: 60, cutoffState: "passed" })[0].id, "light");
});
