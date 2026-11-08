import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormField } from "@/components/ui/form-field";
import { InputGroup } from "@/components/ui/input-group";

// SKAI-1003 (axe aria-allowed-attr): a compound InputGroup wrapper is a plain
// <div>, so aria-required/aria-invalid must never land on it.
test("FormField keeps ARIA field state off a compound InputGroup wrapper", () => {
  const html = renderToStaticMarkup(
    <FormField name="email" label="Email" required error="Enter an email">
      <InputGroup><input id="email" type="email" /></InputGroup>
    </FormField>,
  );
  const wrapper = html.match(/<div[^>]*sk-input-group[^>]*>/)?.[0] ?? "";
  assert.ok(wrapper, "renders the input group");
  assert.doesNotMatch(wrapper, /aria-(required|invalid|describedby)=/);
});

test("FormField still wires ARIA state onto a plain control", () => {
  const html = renderToStaticMarkup(
    <FormField name="name" label="Name" required error="Required">
      <input type="text" />
    </FormField>,
  );
  assert.match(html, /<input[^>]*aria-invalid="true"/);
  assert.match(html, /<input[^>]*aria-required="true"/);
});
