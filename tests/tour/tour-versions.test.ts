/**
 * SKAI-1979: /api/auth/tour validates against TOUR_VERSIONS (progress.ts) so it never loads the tour definitions and
 * their ar/ur catalogs. The two must agree, or a finished tour would be rejected or a newer one accepted.
 *   node --import tsx --test tests/tour/tour-versions.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOURS, TOUR_IDS, TOUR_VERSIONS, tourProgressInput } from "../../src/lib/onboarding/tours";

test("every shipped tour version matches TOUR_VERSIONS", () => {
  assert.deepEqual(Object.keys(TOUR_VERSIONS).sort(), [...TOUR_IDS].sort());
  for (const id of TOUR_IDS) assert.equal(TOURS[id].version, TOUR_VERSIONS[id], `${id}: definition and TOUR_VERSIONS disagree`);
});

test("the POST body accepts the shipped version and rejects a newer one", () => {
  for (const id of TOUR_IDS) {
    assert.equal(tourProgressInput.safeParse({ tourId: id, version: TOURS[id].version, status: "done" }).success, true);
    assert.equal(tourProgressInput.safeParse({ tourId: id, version: TOURS[id].version + 1, status: "done" }).success, false);
  }
});
