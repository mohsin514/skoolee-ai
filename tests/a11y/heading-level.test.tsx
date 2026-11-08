import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "@/components/ui/empty-state";
import { InsightCard } from "@/components/insights/chart-kit";

// SKAI-1003 live axe (heading-order): an EmptyState or InsightCard sitting
// directly under the page h1 must be able to render an h2 instead of skipping to h3.
test("EmptyState renders h3 by default and h2 when asked", () => {
  assert.match(renderToStaticMarkup(<EmptyState title="Nothing yet" />), /<h3[^>]*>Nothing yet<\/h3>/);
  assert.match(renderToStaticMarkup(<EmptyState title="Nothing yet" headingLevel={2} />), /<h2[^>]*>Nothing yet<\/h2>/);
});

test("InsightCard renders h3 by default and h2 when asked", () => {
  assert.match(renderToStaticMarkup(<InsightCard title="Schools by plan"><p>x</p></InsightCard>), /<h3[^>]*>Schools by plan<\/h3>/);
  assert.match(renderToStaticMarkup(<InsightCard title="Schools by plan" headingLevel={2}><p>x</p></InsightCard>), /<h2[^>]*>Schools by plan<\/h2>/);
});
