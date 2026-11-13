import { test } from "node:test";
import assert from "node:assert/strict";
import { BACK_TO_TOP_AFTER, BACK_TO_TOP_END_ROOM, shouldShowBackToTop } from "../../src/components/role-dashboard/back-to-top";

// The roster scroll area from the SKAI-1930 report: 1366x900 viewport, pager as the last row.
const clientHeight = 760;
const scrollHeight = 3200;
const end = scrollHeight - clientHeight;

test("stays hidden near the top of a page", () => {
  assert.equal(shouldShowBackToTop({ scrollTop: 0, scrollHeight, clientHeight }), false);
  assert.equal(shouldShowBackToTop({ scrollTop: BACK_TO_TOP_AFTER, scrollHeight, clientHeight }), false);
});

test("appears once well down a long page", () => {
  assert.equal(shouldShowBackToTop({ scrollTop: BACK_TO_TOP_AFTER + 1, scrollHeight, clientHeight }), true);
  assert.equal(shouldShowBackToTop({ scrollTop: end - BACK_TO_TOP_END_ROOM - 1, scrollHeight, clientHeight }), true);
});

test("stands aside at the end of the page so the list pager stays clickable", () => {
  assert.equal(shouldShowBackToTop({ scrollTop: end, scrollHeight, clientHeight }), false);
  assert.equal(shouldShowBackToTop({ scrollTop: end - BACK_TO_TOP_END_ROOM, scrollHeight, clientHeight }), false);
  // Fractional scroll positions on zoomed or high-density screens still count as the end.
  assert.equal(shouldShowBackToTop({ scrollTop: end - 0.5, scrollHeight, clientHeight }), false);
});
