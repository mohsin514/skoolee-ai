import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorState } from "../../src/components/ui/error-state";
import { RequestFailure } from "../../src/lib/http/request-state";
import { translateUi } from "../../src/lib/locale/ui-messages";

test("denial renders access notice with next action, no misleading retry or empty dataset", () => {
  const html=renderToStaticMarkup(<ErrorState error={new RequestFailure("denied")} onRetry={()=>{}} />);
  assert.match(html,/data-resource-state="denied"/); assert.match(html,/Back to dashboard/); assert.doesNotMatch(html,/Try again|Nothing here|No records/);
});
test("recoverable failures expose distinct descriptions and a retry", () => {
  for(const kind of ["offline","timeout","conflict","provider","limited","server"] as const){
    const html=renderToStaticMarkup(<ErrorState error={new RequestFailure(kind)} onRetry={()=>{}} />);
    assert.match(html,new RegExp(`data-failure-kind="${kind}"`)); assert.match(html,/role="alert"/); assert.match(html,/Try again/);
  }
});
test("new actionable state messages translate into Urdu", () => {
  for(const message of ["The request timed out","This record has changed","No matching records","Sign in again","A service is unavailable","Ask your school administrator for access or choose an available workspace."]) assert.notEqual(translateUi(message,"ur"),message);
});
