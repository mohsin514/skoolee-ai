import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { OversightPanel } from "../../src/components/care/care";
import { RequestFailure } from "../../src/lib/http/request-state";

// SKAI-1697: synthetic QA-01 rows only.
const grant = { id: "g-qa-1", user: "QA Nurse", studentName: "QA Student One", purpose: "Synthetic", createdAt: "2026-10-01T08:00:00.000Z", expiresAt: "2026-10-01T09:00:00.000Z", revokedAt: null, live: true, uses: 1, reviewedAt: null, reviewedBy: null, reviewNote: null };
const data = { grants: [grant], logs: [{ id: "l-qa-1", actor: "QA Nurse", action: "VIEW", recordType: "CLINIC_VISIT", emergency: true, createdAt: "2026-10-01T08:05:00.000Z" }] };
const empty = { grants: [], logs: [] };
const render = (props: Partial<React.ComponentProps<typeof OversightPanel>>) => renderToStaticMarkup(<OversightPanel domain="CLINIC" data={null} failure={null} reload={async () => {}} {...props} />);

for (const domain of ["CLINIC", "SAFEGUARDING"] as const) {
  test(`${domain}: a failed first load shows a retryable error, not nothing and not an empty state`, () => {
    for (const kind of ["server", "offline", "provider"] as const) {
      const html = render({ domain, failure: new RequestFailure(kind) });
      assert.match(html, new RegExp(`data-care-oversight="${domain}"`));
      assert.match(html, /data-oversight-state="failure"/);
      assert.match(html, /role="alert"/);
      assert.match(html, /Try again/);
      assert.doesNotMatch(html, /No emergency access has been opened/);
    }
  });
}

test("a failed refresh keeps the last known grants and logs and shows retry", () => {
  const html = render({ data, failure: new RequestFailure("server") });
  assert.match(html, /data-oversight-state="stale"/);
  assert.match(html, /data-emergency-grant="g-qa-1"/);
  assert.match(html, /data-access-log="VIEW"/);
  assert.match(html, /Try again/);
});

test("loading and a successful empty result stay distinct from failure", () => {
  const loading = render({});
  assert.match(loading, /data-oversight-state="loading"/);
  assert.doesNotMatch(loading, /role="alert"/);
  const ready = render({ data: empty });
  assert.match(ready, /data-oversight-state="ready"/);
  assert.match(ready, /No emergency access has been opened/);
  assert.doesNotMatch(ready, /role="alert"|Try again/);
});

test("a denied load explains access instead of offering a retry or an empty list", () => {
  const html = render({ failure: new RequestFailure("denied") });
  assert.match(html, /data-resource-state="denied"/);
  assert.doesNotMatch(html, /No emergency access has been opened/);
});
